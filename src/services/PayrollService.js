const knex = require("../config/database");
const path = require("path");
const ExcelJS = require("exceljs");
const fs = require("fs");

const {
  generatePayslipPdf,
} = require("../utils/payslipPdf");

// CREATE PAYROLL RUN

async function createPayrollRun({ adminId, month, year }) {
  // VALIDATE MONTH

  const monthNumber = Number(month);

  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    const error = new Error("Month must be between 1 and 12");

    error.code = "INVALID_MONTH";

    throw error;
  }

  // VALIDATE YEAR

  const yearNumber = Number(year);

  if (!Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2100) {
    const error = new Error("Invalid year");

    error.code = "INVALID_YEAR";

    throw error;
  }

  // CHECK IF PAYROLL RUN ALREADY EXISTS

  const existingRun = await knex("payroll_runs")
    .where({
      month: monthNumber,

      year: yearNumber,
    })
    .first();

  if (existingRun) {
    const error = new Error(
      `Payroll run already exists for ${monthNumber}/${yearNumber}`,
    );

    error.code = "DUPLICATE";

    error.payrollRun = existingRun;

    throw error;
  }

  // CHECK PREVIOUS MONTH
  //
  // WARNING ONLY
  // DOES NOT BLOCK CREATION

  let previousMonth = monthNumber - 1;

  let previousYear = yearNumber;

  if (previousMonth === 0) {
    previousMonth = 12;

    previousYear -= 1;
  }

  const previousRun = await knex("payroll_runs")
    .where({
      month: previousMonth,

      year: previousYear,
    })
    .first();

  let previousMonthWarning = null;

  if (!previousRun) {
    previousMonthWarning = `Previous month payroll run ${previousMonth}/${previousYear} does not exist`;
  } else if (previousRun.status !== "FINALIZED") {
    previousMonthWarning = `Previous month payroll run ${previousMonth}/${previousYear} is not finalized`;
  }

  // TRANSACTION

  return await knex.transaction(async (trx) => {
    // CREATE DRAFT PAYROLL RUN

    const [payrollRun] = await trx("payroll_runs")
      .insert({
        month: monthNumber,

        year: yearNumber,

        status: "DRAFT",
      })
      .returning(["id", "month", "year", "status", "created_at", "updated_at"]);

    // GET ACTIVE USERS

    const users = await trx("users")
  .select("id", "emp_code", "name", "designation")
  .where("status", "ACTIVE")
  .where("role", "EMPLOYEE");

    const payrollItems = [];

    // PROCESS EACH ACTIVE EMPLOYEE

    for (const user of users) {
      // FIND SALARY STRUCTURE EFFECTIVE FOR PAYROLL MONTH

      const monthStart = `${yearNumber}-${String(monthNumber).padStart(2, "0")}-01`;

      const monthEndDate = new Date(Date.UTC(yearNumber, monthNumber, 0));

      const monthEnd = monthEndDate.toISOString().slice(0, 10);

      const salary = await trx("salary_structures")
        .where("user_id", user.id)
        .where("effective_from", "<=", monthEnd)
        .where(function () {
          this.whereNull("effective_to").orWhere(
            "effective_to",
            ">=",
            monthStart,
          );
        })
        .orderBy("effective_from", "desc")
        .first();

      // NO SALARY STRUCTURE

      if (!salary) {
        const error = new Error(
          `No salary structure found for employee ${user.id}`,
        );

        error.code = "SALARY_STRUCTURE_NOT_FOUND";

        error.userId = user.id;

        throw error;
      }

      // GET DAY SUMMARIES

      const daySummaries = await trx("day_summaries")
        .select("work_date", "status", "lop_value", "is_locked")
        .where("user_id", user.id)
        .whereRaw("EXTRACT(YEAR FROM work_date) = ?", [yearNumber])
        .whereRaw("EXTRACT(MONTH FROM work_date) = ?", [monthNumber]);

      // SUM LOP

      let lopDays = 0;

      for (const day of daySummaries) {
        lopDays += Number(day.lop_value || 0);
      }

      // CALENDAR DAYS

      const calendarDays = new Date(
        Date.UTC(yearNumber, monthNumber, 0),
      ).getUTCDate();

      // PAYABLE DAYS
      // Based on calendar days minus LOP.

      const payableDays = Math.max(0, calendarDays - lopDays);

      // payroll_divisor = CALENDAR_DAYS

      const perDay = Number(salary.gross) / calendarDays;

      // LOP AMOUNT

      const lopAmount = perDay * lopDays;

      // OTHER EARNINGS / DEDUCTIONS

      const otherEarnings = [];

      const otherDeductions = [];

      // NET PAY

      const otherEarningsTotal = otherEarnings.reduce(
        (total, item) => total + Number(item.amount || 0),
        0,
      );

      const otherDeductionsTotal = otherDeductions.reduce(
        (total, item) => total + Number(item.amount || 0),
        0,
      );

      const netPay =
        Number(salary.gross) -
        lopAmount +
        otherEarningsTotal -
        otherDeductionsTotal;

      // CREATE PAYROLL ITEM

      payrollItems.push({
        payroll_run_id: payrollRun.id,

        user_id: user.id,

        gross: Number(salary.gross),

        calendar_days: calendarDays,

        payable_days: payableDays,

        lop_days: lopDays,

        per_day: perDay,

        lop_amount: lopAmount,

        other_earnings: JSON.stringify(otherEarnings),

        other_deductions: JSON.stringify(otherDeductions),

        net_pay: netPay,

        remarks: null,
      });
    }

    // INSERT PAYROLL ITEMS

    let insertedItems = [];

    if (payrollItems.length > 0) {
      insertedItems = await trx("payroll_items")
        .insert(payrollItems)
        .returning([
          "id",
          "payroll_run_id",
          "user_id",
          "gross",
          "calendar_days",
          "payable_days",
          "lop_days",
          "per_day",
          "lop_amount",
          "other_earnings",
          "other_deductions",
          "net_pay",
          "remarks",
        ]);
    }

    // AUDIT

    await trx("audit_log").insert({
      actor_id: adminId,

      action: "PAYROLL_RUN_CREATED",

      entity_type: "payroll_runs",

      entity_id: payrollRun.id,

      before: null,

      after: JSON.stringify({
        id: payrollRun.id,

        month: monthNumber,

        year: yearNumber,

        status: "DRAFT",

        employee_count: insertedItems.length,
      }),

      reason: `Payroll run created for ${monthNumber}/${yearNumber}`,
    });

    // RESPONSE

    return {
      success: true,

      message: "Payroll run created successfully",

      warning: previousMonthWarning,

      data: {
        payroll_run: payrollRun,

        employee_count: insertedItems.length,

        payroll_items: insertedItems,
      },
    };
  });
}

// GET PAYROLL RUNS

async function getPayrollRuns({ year }) {
  // VALIDATE YEAR

  const yearNumber = Number(year);

  if (
    !Number.isInteger(yearNumber) ||
    yearNumber < 2000 ||
    yearNumber > 2100
  ) {
    const error = new Error("Invalid year");

    error.code = "INVALID_YEAR";

    throw error;
  }

  // FETCH PAYROLL RUNS

  const payrollRuns = await knex("payroll_runs")
    .select(
      "id",
      "month",
      "year",
      "status",
      "finalized_by",
      "finalized_at",
      "created_at",
      "updated_at"
    )
    .where("year", yearNumber)
    .orderBy("month", "desc");

  return {
    success: true,
    message: "Payroll runs fetched successfully",
    data: {
      year: yearNumber,
      total: payrollRuns.length,
      payroll_runs: payrollRuns,
    },
  };
}

// GET PAYROLL RUN DETAILS

async function getPayrollRunById({ payrollRunId }) {
  // VALIDATE ID

  const id = Number(payrollRunId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll run id");

    error.code = "INVALID_ID";

    throw error;
  }

  // GET PAYROLL RUN

  const payrollRun = await knex("payroll_runs")
    .where("id", id)
    .first();

  if (!payrollRun) {
    const error = new Error("Payroll run not found");

    error.code = "NOT_FOUND";

    throw error;
  }

  // GET PAYROLL ITEMS

  const payrollItems = await knex("payroll_items as pi")
    .join("users as u", "pi.user_id", "u.id")
    .select(
      "pi.id",
      "pi.user_id",
      "pi.gross",
      "pi.calendar_days",
      "pi.payable_days",
      "pi.lop_days",
      "pi.per_day",
      "pi.lop_amount",
      "pi.other_earnings",
      "pi.other_deductions",
      "pi.net_pay",
      "pi.remarks",

      "u.emp_code",
      "u.name",
      "u.designation"
    )
    .where("pi.payroll_run_id", id)
    .orderBy("u.name");

  // GET LOP DATES FOR EACH EMPLOYEE

  for (const item of payrollItems) {
    const lopDates = await knex("day_summaries")
      .select(
        "work_date",
        "status",
        "lop_value"
      )
      .where("user_id", item.user_id)
      .whereRaw("EXTRACT(YEAR FROM work_date)=?", [payrollRun.year])
      .whereRaw("EXTRACT(MONTH FROM work_date)=?", [payrollRun.month])
      .where("lop_value", ">", 0)
      .orderBy("work_date");

    item.lop_dates = lopDates;
  }

  return {
    success: true,
    message: "Payroll run fetched successfully",
    data: {
      payroll_run: payrollRun,
      employee_count: payrollItems.length,
      payroll_items: payrollItems,
    },
  };
}


// UPDATE PAYROLL ITEMS

async function updatePayrollItem({
  payrollItemId,
  adminId,
  otherEarnings = [],
  otherDeductions = [],
  remarks = null,
}) {

  // VALIDATE ID

  const id = Number(payrollItemId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll item id");

    error.code = "INVALID_ID";

    throw error;
  }

  return await knex.transaction(async (trx) => {

    // GET PAYROLL ITEM

    const payrollItem = await trx("payroll_items")
      .where("id", id)
      .first();

    if (!payrollItem) {
      const error = new Error("Payroll item not found");

      error.code = "NOT_FOUND";

      throw error;
    }

    // GET PAYROLL RUN

    const payrollRun = await trx("payroll_runs")
      .where("id", payrollItem.payroll_run_id)
      .first();

    // ONLY DRAFT CAN BE EDITED

    if (payrollRun.status !== "DRAFT") {

      const error = new Error(
        "Payroll run has already been finalized"
      );

      error.code = "INVALID_STATE";

      throw error;
    }

    // CALCULATE TOTALS

    const earningsTotal = otherEarnings.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const deductionsTotal = otherDeductions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    // RECOMPUTE NET PAY

    const netPay =
      Number(payrollItem.gross) -
      Number(payrollItem.lop_amount) +
      earningsTotal -
      deductionsTotal;

    // KEEP BEFORE FOR AUDIT

    const before = {
      other_earnings: payrollItem.other_earnings,
      other_deductions: payrollItem.other_deductions,
      remarks: payrollItem.remarks,
      net_pay: payrollItem.net_pay,
    };

    // UPDATE

    const [updatedItem] = await trx("payroll_items")
      .where("id", id)
      .update({
        other_earnings: JSON.stringify(otherEarnings),
        other_deductions: JSON.stringify(otherDeductions),
        remarks,
        net_pay: netPay,
        updated_at: trx.fn.now(),
      })
      .returning("*");

    // AUDIT

    await trx("audit_log").insert({
      actor_id: adminId,
      action: "PAYROLL_ITEM_UPDATED",
      entity_type: "payroll_items",
      entity_id: id,
      before: JSON.stringify(before),
      after: JSON.stringify({
        other_earnings: otherEarnings,
        other_deductions: otherDeductions,
        remarks,
        net_pay: netPay,
      }),
      reason: "Payroll item updated",
    });

    return {
      success: true,
      message: "Payroll item updated successfully",
      data: {
        payroll_item: updatedItem,
      },
    };

  });
}


// RECOMPUTE PAYROLL RUN

async function recomputePayrollRun({
  payrollRunId,
  adminId,
}) {

  const id = Number(payrollRunId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll run id");
    error.code = "INVALID_ID";
    throw error;
  }

  return knex.transaction(async (trx) => {

    // PAYROLL RUN

    const payrollRun = await trx("payroll_runs")
      .where("id", id)
      .first();

    if (!payrollRun) {
      const error = new Error("Payroll run not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    if (payrollRun.status !== "DRAFT") {
      const error = new Error(
        "Payroll run is already finalized"
      );

      error.code = "INVALID_STATE";

      throw error;
    }

    // PAYROLL ITEMS

    const payrollItems = await trx("payroll_items")
      .where("payroll_run_id", id);

    let updatedCount = 0;

    for (const item of payrollItems) {

      // SALARY

      const salary = await trx("salary_structures")
        .where("user_id", item.user_id)
        .where("effective_from", "<=", `${payrollRun.year}-${String(payrollRun.month).padStart(2, "0")}-31`)
        .orderBy("effective_from", "desc")
        .first();

      // DAY SUMMARIES

      const summaries = await trx("day_summaries")
        .select("lop_value")
        .where("user_id", item.user_id)
        .whereRaw(
          "EXTRACT(YEAR FROM work_date)=?",
          [payrollRun.year]
        )
        .whereRaw(
          "EXTRACT(MONTH FROM work_date)=?",
          [payrollRun.month]
        );

      let lopDays = 0;

      summaries.forEach(day => {
        lopDays += Number(day.lop_value || 0);
      });

      const calendarDays = new Date(
        Date.UTC(
          payrollRun.year,
          payrollRun.month,
          0
        )
      ).getUTCDate();

      const payableDays =
        calendarDays - lopDays;

      const perDay =
        Number(salary.gross) / calendarDays;

      const lopAmount =
        perDay * lopDays;

      // PRESERVE MANUAL ADJUSTMENTS

      const earnings =
        item.other_earnings || [];

      const deductions =
        item.other_deductions || [];

      const earningsTotal =
        earnings.reduce(
          (sum, e) => sum + Number(e.amount || 0),
          0
        );

      const deductionsTotal =
        deductions.reduce(
          (sum, d) => sum + Number(d.amount || 0),
          0
        );

      const netPay =
        Number(salary.gross) -
        lopAmount +
        earningsTotal -
        deductionsTotal;

      await trx("payroll_items")
        .where("id", item.id)
        .update({
          gross: salary.gross,
          calendar_days: calendarDays,
          payable_days: payableDays,
          lop_days: lopDays,
          per_day: perDay,
          lop_amount: lopAmount,
          net_pay: netPay,
          updated_at: trx.fn.now(),
        });

      updatedCount++;
    }

    // AUDIT

    await trx("audit_log").insert({
      actor_id: adminId,
      action: "PAYROLL_RUN_RECOMPUTED",
      entity_type: "payroll_runs",
      entity_id: id,
      before: null,
      after: JSON.stringify({
        payroll_run_id: id,
        updated_items: updatedCount,
      }),
      reason:
        "Payroll recomputed after attendance changes",
    });

    return {
      success: true,
      message:
        "Payroll recomputed successfully",
      data: {
        payroll_run_id: id,
        updated_items: updatedCount,
      },
    };

  });

}


// FINALIZE PAYROLL RUN

// =============================================================
// BUILD PAYSLIP DATA
// =============================================================

async function buildPayslipData({
  trx,
  user,
  payrollRun,
  payrollItem,
}) {
  const year = Number(payrollRun.year);
  const month = Number(payrollRun.month);

  /*
   * -----------------------------------------------------------
   * SALARY STRUCTURE
   *
   * Pick the salary structure which was effective during
   * this payroll month.
   *
   * Example:
   *
   * effective_from = 2026-01-01
   * effective_to   = null
   *
   * will be used for March 2026.
   * -----------------------------------------------------------
   */

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const monthEndDate = new Date(
    Date.UTC(year, month, 0)
  );

  const monthEnd =
    `${monthEndDate.getUTCFullYear()}-${String(
      monthEndDate.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(
      monthEndDate.getUTCDate()
    ).padStart(2, "0")}`;

  const salaryStructure = await trx("salary_structures")
    .where("user_id", user.id)
    .where("effective_from", "<=", monthEnd)
    .where(function () {
      this
        .whereNull("effective_to")
        .orWhere("effective_to", ">=", monthStart);
    })
    .orderBy("effective_from", "desc")
    .first();

  /*
   * -----------------------------------------------------------
   * EARNINGS
   * -----------------------------------------------------------
   *
   * Salary components come from salary_structures.
   *
   * Additional/manual earnings come from payroll_items.
   */

  const earnings = [];

  if (salaryStructure) {
    const basic = Number(
      salaryStructure.basic || 0
    );

    const hra = Number(
      salaryStructure.hra || 0
    );

    const specialAllowance = Number(
      salaryStructure.special_allowance || 0
    );

    if (basic > 0) {
      earnings.push({
        label: "Basic Salary",
        amount: basic,
      });
    }

    if (hra > 0) {
      earnings.push({
        label: "HRA",
        amount: hra,
      });
    }

    if (specialAllowance > 0) {
      earnings.push({
        label: "Special Allowance",
        amount: specialAllowance,
      });
    }
  }

  /*
   * Additional earnings stored in payroll_items.other_earnings
   *
   * Example:
   *
   * [
   *   {
   *     "label": "Performance Bonus",
   *     "amount": 5000
   *   }
   * ]
   */

  const otherEarnings =
    Array.isArray(payrollItem.other_earnings)
      ? payrollItem.other_earnings
      : [];

  for (const earning of otherEarnings) {
    earnings.push({
      label:
        earning.label ||
        "Other Earnings",

      amount:
        Number(earning.amount) || 0,
    });
  }

  // DEDUCTIONS

  const deductions = [];

  /*
   * LOP deduction
   */

  const lopAmount =
    Number(payrollItem.lop_amount) || 0;

  if (lopAmount > 0) {
    deductions.push({
      label: "LOP Deduction",
      amount: lopAmount,
    });
  }

  /*
   * Other deductions
   */

  const otherDeductions =
    Array.isArray(payrollItem.other_deductions)
      ? payrollItem.other_deductions
      : [];

  for (const deduction of otherDeductions) {
    deductions.push({
      label:
        deduction.label ||
        "Other Deduction",

      amount:
        Number(deduction.amount) || 0,
    });
  }

  /*
   * -----------------------------------------------------------
   * TOTALS
   * -----------------------------------------------------------
   */

  const grossEarnings =
    Number(payrollItem.gross) || 0;

  const totalDeductions =
    deductions.reduce(
      (total, deduction) =>
        total + Number(deduction.amount || 0),
      0
    );

  const netPay =
    Number(payrollItem.net_pay) || 0;

  /*
   * -----------------------------------------------------------
   * COMPANY
   *
   * There is currently no company table in your schema.
   *
   * Therefore use environment variables for now.
   *
   * Later, if you add company settings/table, replace this
   * section with a DB query.
   * -----------------------------------------------------------
   */

  const company = {
    name:
      process.env.COMPANY_NAME ||
      "NANDGATE IT SERVICES PVT LTD",

    location:
      process.env.COMPANY_LOCATION ||
      "",
  };

  /*
   * -----------------------------------------------------------
   * EMPLOYEE
   * -----------------------------------------------------------
   */

  const employee = {
    name:
      user.name || "-",

    designation:
      user.designation || "-",

    employeeId:
      user.emp_code || "-",

    dateOfJoining:
      user.date_of_joining || null,
  };

  /*
   * -----------------------------------------------------------
   * PAYROLL
   * -----------------------------------------------------------
   *
   * payroll_items has:
   *
   * calendar_days
   * payable_days
   * lop_days
   *
   * payslips currently do NOT have pay_date.
   *
   * Therefore payDate is null and PDF will display "-".
   * -----------------------------------------------------------
   */

  const payroll = {
    month,
    year,

    calendarDays:
      payrollItem.calendar_days ?? 0,

    paidDays:
      payrollItem.payable_days ?? 0,

    lopDays:
      payrollItem.lop_days ?? 0,

    payDate:
      null,
  };

  return {
    company,
    employee,
    payroll,

    earnings,
    deductions,

    grossEarnings,
    totalDeductions,
    netPay,
  };
}


// =============================================================
// FINALIZE PAYROLL RUN
// =============================================================

async function finalizePayrollRun({
  payrollRunId,
  adminId,
}) {
  const id = Number(payrollRunId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    const error = new Error(
      "Invalid payroll run id"
    );

    error.code = "INVALID_ID";

    throw error;
  }

  /*
   * Keep track of generated files.
   *
   * If the transaction fails, generated PDFs are removed.
   */

  const generatedFiles = [];

  try {
    const result =
      await knex.transaction(async (trx) => {

        // =====================================================
        // PAYROLL RUN
        // =====================================================

        /*
         * forUpdate prevents two admins/processes from
         * finalizing the same payroll simultaneously.
         */

        const payrollRun =
          await trx("payroll_runs")
            .where("id", id)
            .forUpdate()
            .first();

        if (!payrollRun) {
          const error = new Error(
            "Payroll run not found"
          );

          error.code = "NOT_FOUND";

          throw error;
        }

        if (
          payrollRun.status !== "DRAFT"
        ) {
          const error = new Error(
            "Payroll run is already finalized"
          );

          error.code = "INVALID_STATE";

          throw error;
        }

        // =====================================================
        // PAYROLL ITEMS
        // =====================================================

        const payrollItems =
          await trx("payroll_items")
            .where(
              "payroll_run_id",
              id
            )
            .orderBy("id");

        if (
          payrollItems.length === 0
        ) {
          const error = new Error(
            "Payroll run has no payroll items"
          );

          error.code = "INVALID_STATE";

          throw error;
        }

        // =====================================================
        // GENERATE PAYSLIPS
        // =====================================================

        for (const item of payrollItems) {

          // ---------------------------------------------------
          // EMPLOYEE
          // ---------------------------------------------------

          const user =
            await trx("users")
              .where(
                "id",
                item.user_id
              )
              .first();

          if (!user) {
            const error = new Error(
              `Employee not found for payroll item ${item.id}`
            );

            error.code = "NOT_FOUND";

            throw error;
          }

          // ---------------------------------------------------
          // EXISTING PAYSLIP CHECK
          // ---------------------------------------------------

          const existingPayslip =
            await trx("payslips")
              .where(
                "payroll_item_id",
                item.id
              )
              .first();

          if (existingPayslip) {
            const error = new Error(
              `Payslip already exists for payroll item ${item.id}`
            );

            error.code = "INVALID_STATE";

            throw error;
          }

          // ---------------------------------------------------
          // BUILD PDF DATA FROM DATABASE
          // ---------------------------------------------------

          const payslipData =
            await buildPayslipData({
              trx,
              user,
              payrollRun,
              payrollItem: item,
            });

          // ---------------------------------------------------
          // FILE NAME
          // ---------------------------------------------------

          const fileName =
            `payslip-${user.emp_code}-${payrollRun.year}-${String(
              payrollRun.month
            ).padStart(2, "0")}-${item.id}.pdf`;

          // ---------------------------------------------------
          // RELATIVE PATH
          // ---------------------------------------------------

          const relativePath =
            path.join(
              "uploads",
              "payslips",
              String(payrollRun.year),
              String(payrollRun.month)
                .padStart(2, "0"),
              fileName
            );

          // ---------------------------------------------------
          // ABSOLUTE FILE PATH
          // ---------------------------------------------------

          const filePath =
            path.join(
              process.cwd(),
              relativePath
            );

          // ---------------------------------------------------
          // GENERATE PDF
          // ---------------------------------------------------

          await generatePayslipPdf({
            payslipData,
            filePath,
          });

          generatedFiles.push(
            filePath
          );

          // ---------------------------------------------------
          // INSERT PAYSLIP
          // ---------------------------------------------------

          await trx("payslips")
            .insert({
              payroll_item_id:
                item.id,

              user_id:
                item.user_id,

              month:
                payrollRun.month,

              year:
                payrollRun.year,

              pdf_path:
                relativePath,

              /*
               * Published immediately when payroll is
               * finalized.
               */

              published_at:
                trx.fn.now(),
            });
        }

        // =====================================================
        // LOCK DAY SUMMARIES
        // =====================================================

        const lockedCount =
          await trx("day_summaries")
            .whereRaw(
              "EXTRACT(YEAR FROM work_date) = ?",
              [payrollRun.year]
            )
            .whereRaw(
              "EXTRACT(MONTH FROM work_date) = ?",
              [payrollRun.month]
            )
            .update({
              is_locked: true,

              updated_at:
                trx.fn.now(),
            });

        // =====================================================
        // FINALIZE PAYROLL RUN
        // =====================================================

        await trx("payroll_runs")
          .where("id", id)
          .update({
            status: "FINALIZED",

            finalized_by:
              adminId,

            finalized_at:
              trx.fn.now(),

            updated_at:
              trx.fn.now(),
          });

        // =====================================================
        // AUDIT LOG
        // =====================================================

        await trx("audit_log")
          .insert({
            actor_id:
              adminId,

            action:
              "PAYROLL_FINALIZED",

            entity_type:
              "payroll_runs",

            entity_id:
              id,

            before:
              JSON.stringify({
                status: "DRAFT",
              }),

            after:
              JSON.stringify({
                status:
                  "FINALIZED",

                payroll_run_id:
                  id,

                payslips_generated:
                  payrollItems.length,

                day_summaries_locked:
                  lockedCount,
              }),

            reason:
              "Payroll run finalized and payslips published",
          });

        // =====================================================
        // RETURN
        // =====================================================

        return {
          success: true,

          message:
            "Payroll finalized successfully",

          data: {
            payroll_run_id:
              id,

            status:
              "FINALIZED",

            payslips_generated:
              payrollItems.length,

            day_summaries_locked:
              lockedCount,
          },
        };
      });

    /*
     * =========================================================
     * TRANSACTION SUCCESSFULLY COMMITTED
     * =========================================================
     *
     * FCM should be sent only after this point.
     */

    // await sendPayslipPublishedNotifications({
    //   payrollRunId: id,
    // });

    return result;

  } catch (error) {

    /*
     * =========================================================
     * CLEANUP GENERATED PDF FILES
     * =========================================================
     */

    for (
      const filePath
      of generatedFiles
    ) {
      try {

        if (
          fs.existsSync(filePath)
        ) {
          fs.unlinkSync(
            filePath
          );
        }

      } catch (cleanupError) {

        console.error(
          "Failed to cleanup payslip PDF:",
          cleanupError
        );
      }
    }

    throw error;
  }
}



// ============================================================
// DATE FORMATTER
// ============================================================
//
// Display timezone:
// Asia/Kolkata
//
// Output:
// DD/MM/YYYY
// ============================================================

function formatDate(value) {

  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Kolkata",

      day: "2-digit",

      month: "2-digit",

      year: "numeric",
    }
  ).format(date);
}




// EXPORT PAYROLL RUN

async function exportPayrollRun({ payrollRunId }) {

  const id = Number(payrollRunId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll run id");
    error.code = "INVALID_ID";
    throw error;
  }

  // PAYROLL RUN

  const payrollRun = await knex("payroll_runs")
    .where("id", id)
    .first();

  if (!payrollRun) {
    const error = new Error("Payroll run not found");
    error.code = "NOT_FOUND";
    throw error;
  }

  // PAYROLL ITEMS

  const payrollItems = await knex("payroll_items as pi")
    .join("users as u", "pi.user_id", "u.id")
    .select(
      "u.emp_code",
      "u.name",
      "u.designation",

      "pi.gross",
      "pi.calendar_days",
      "pi.payable_days",
      "pi.lop_days",
      "pi.per_day",
      "pi.lop_amount",

      "pi.net_pay",
      "pi.remarks"
    )
    .where("pi.payroll_run_id", id)
    .orderBy("u.emp_code");

  // EXCEL

  const workbook = new ExcelJS.Workbook();

  const worksheet =
    workbook.addWorksheet("Payroll Register");

  worksheet.columns = [
    { header: "Emp Code", key: "emp_code", width: 15 },
    { header: "Employee Name", key: "name", width: 30 },
    { header: "Designation", key: "designation", width: 25 },
    { header: "Gross", key: "gross", width: 15 },
    { header: "Calendar Days", key: "calendar_days", width: 18 },
    { header: "Payable Days", key: "payable_days", width: 18 },
    { header: "LOP Days", key: "lop_days", width: 12 },
    { header: "Per Day", key: "per_day", width: 15 },
    { header: "LOP Amount", key: "lop_amount", width: 15 },
    { header: "Net Pay", key: "net_pay", width: 15 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];

  // HEADER STYLE

  worksheet.getRow(1).font = {
    bold: true,
  };

  // DATA

  payrollItems.forEach((item) => {
    worksheet.addRow(item);
  });

  // NUMBER FORMAT

  ["D", "H", "I", "J"].forEach((column) => {
    worksheet.getColumn(column).numFmt = "#,##0.00";
  });

  const fileName = `Payroll_${payrollRun.month}_${payrollRun.year}.xlsx`;

  return {
    workbook,
    fileName,
  };
}

// GET MY PAYSLIP

// async function getMyPayslips({
//   userId,
// }) {

//   const payslips =
//     await knex("payslips")
//       .select(
//         "id",
//         "month",
//         "year",
//         "pdf_path",
//         "published_at",
//         "created_at"
//       )
//       .where("user_id", userId)
//       .whereNotNull("published_at")
//       .orderBy([
//         {
//           column: "year",
//           order: "desc",
//         },
//         {
//           column: "month",
//           order: "desc",
//         },
//       ]);

//   return {
//     success: true,
//     message:
//       "Payslips fetched successfully",
//     data: {
//       total: payslips.length,
//       payslips,
//     },
//   };

// }


async function getMyPayslips({
  userId,
}) {

  const payslips =
    await knex("payslips")
      .select(
        "id",
        "month",
        "year",
        "published_at",
        "created_at"
      )
      .where("user_id", userId)
      .whereNotNull("published_at")
      .orderBy([
        {
          column: "year",
          order: "desc",
        },
        {
          column: "month",
          order: "desc",
        },
      ]);

  const data = payslips.map((payslip) => ({
    id: payslip.id,
    month: payslip.month,
    year: payslip.year,
    published_at: payslip.published_at,
    created_at: payslip.created_at,

    download_url:
      `/api/v1/payroll/payslips/me/${payslip.id}/download`,
  }));

  return {
    success: true,
    message: "Payslips fetched successfully",
    data: {
      total: data.length,
      payslips: data,
    },
  };
}

// DOWNLOAD MY PAYSLIP

async function downloadMyPayslip({
  payslipId,
  userId,
}) {

  const id = Number(payslipId);

  if (!Number.isInteger(id) || id <= 0) {

    const error = new Error(
      "Invalid payslip id"
    );

    error.code = "INVALID_ID";

    throw error;

  }

  // GET PAYSLIP

  const payslip = await knex("payslips")
    .where({
      id,
      user_id: userId,
    })
    .whereNotNull("published_at")
    .first();

  if (!payslip) {

    const error = new Error(
      "Payslip not found"
    );

    error.code = "NOT_FOUND";

    throw error;

  }

  // FILE PATH

  const filePath = path.resolve(
    payslip.pdf_path
  );

  // CHECK FILE EXISTS

  if (!fs.existsSync(filePath)) {

    const error = new Error(
      "Payslip PDF not found"
    );

    error.code = "NOT_FOUND";

    throw error;

  }

  return {

    filePath,

    fileName:
      path.basename(filePath),

  };

}


module.exports = {
  createPayrollRun,
  getPayrollRuns,
  getPayrollRunById,
  updatePayrollItem,
  recomputePayrollRun,
  finalizePayrollRun,
  buildPayslipData,
  exportPayrollRun,
  getMyPayslips,
  downloadMyPayslip
};
