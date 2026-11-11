const knex = require("../config/database");
const path = require("path");
const ExcelJS = require("exceljs");
const fs = require("fs");

const {
  generatePayslipPdf,
} = require("../utils/payslipPdf");

// =====================================================
// NOTIFICATION HELPER
// =====================================================

async function notifyUser(trx, {
  userId,
  actorId,
  type,
  title,
  message,
  entityId,
  data = {},
}) {
  await trx("notifications").insert({
    user_id: userId,
    actor_id: actorId,
    type,
    title,
    message,
    entity_type: "payslip",
    entity_id: entityId,
    data,
  });
}


// =====================================================
// HELPER - GET FINAL EMPLOYEE LOP FOR PAYROLL
// =====================================================

async function getFinalEmployeeLopDays({
  trx,
  userId,
  year,
  month,
}) {
  const monthStart =
    `${year}-${String(month).padStart(2, "0")}-01`;

  // First day of the following month (exclusive).
  const nextMonthDate = new Date(
    Date.UTC(year, month, 1)
  );

  const endExclusive = nextMonthDate
    .toISOString()
    .slice(0, 10);

  // GET ATTENDANCE SUMMARIES
  const daySummaries = await trx("day_summaries")
    .select("status", "lop_value")
    .select(
      trx.raw("work_date::text AS work_date")
    )
    .where("user_id", userId)
    .where("work_date", ">=", monthStart)
    .where("work_date", "<", endExclusive);

  // GET LATEST ADJUSTMENT FOR EACH DATE
  const adjustments = await trx("attendance_lop_adjustments")
    .select("new_lop")
    .select(
      trx.raw("work_date::text AS work_date")
    )
    .where("user_id", userId)
    .where("work_date", ">=", monthStart)
    .where("work_date", "<", endExclusive)
    .orderBy("id", "desc");

  const adjustmentMap = new Map();

  // Because results are ordered by descending ID,
  // the first record for each date is the latest.
  for (const adjustment of adjustments) {
    const date = String(adjustment.work_date).slice(0, 10);

    if (!adjustmentMap.has(date)) {
      adjustmentMap.set(date, adjustment);
    }
  }

  let lopDays = 0;

  for (const day of daySummaries) {
    const date = String(day.work_date).slice(0, 10);

    const calculatedLop = Number(day.lop_value || 0);

    const adjustment = adjustmentMap.get(date);

    let finalLop = calculatedLop;

    // Apply adjustment ONLY to ABSENT attendance.
    if (
      day.status === "ABSENT" &&
      adjustment
    ) {
      finalLop = Number(adjustment.new_lop);
    }

    lopDays += finalLop;
  }

  return Number(lopDays.toFixed(2));
}


// CREATE PAYROLL RUN

async function createPayrollRun({ adminId, month, year }) {

  const monthNumber = Number(month);

  if (
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    const error = new Error("Month must be between 1 and 12");
    error.code = "INVALID_MONTH";
    throw error;
  }

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

  // CHECK EXISTING PAYROLL RUN

  const existingRun = await knex("payroll_runs")
    .where({
      month: monthNumber,
      year: yearNumber,
    })
    .first();

  if (existingRun) {
    const error = new Error(
      `Payroll run already exists for ${monthNumber}/${yearNumber}`
    );

    error.code = "DUPLICATE";
    error.payrollRun = existingRun;
    throw error;
  }

  // CHECK PREVIOUS MONTH

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
    previousMonthWarning =
      `Previous month payroll run ${previousMonth}/${previousYear} does not exist`;
  } else if (previousRun.status !== "FINALIZED") {
    previousMonthWarning =
      `Previous month payroll run ${previousMonth}/${previousYear} is not finalized`;
  }

  // MONTH DATE RANGE

  const monthStart =
    `${yearNumber}-${String(monthNumber).padStart(2, "0")}-01`;

  const monthEndDate = new Date(
    Date.UTC(yearNumber, monthNumber, 0)
  );

  const monthEnd = monthEndDate
    .toISOString()
    .slice(0, 10);

  // TRANSACTION

  return await knex.transaction(async (trx) => {

    const [payrollRun] = await trx("payroll_runs")
      .insert({
        month: monthNumber,
        year: yearNumber,
        status: "DRAFT",
      })
      .returning([
        "id",
        "month",
        "year",
        "status",
        "created_at",
        "updated_at",
      ]);

    // GET ACTIVE EMPLOYEES

    const users = await trx("users")
      .select("id", "emp_code", "name", "designation")
      .where("status", "ACTIVE")
      .where("role", "EMPLOYEE");

    const payrollItems = [];

    for (const user of users) {

      // GET EFFECTIVE SALARY STRUCTURE

      const salary = await trx("salary_structures")
        .where("user_id", user.id)
        .where("effective_from", "<=", monthEnd)
        .where(function () {
          this.whereNull("effective_to")
            .orWhere("effective_to", ">=", monthStart);
        })
        .orderBy("effective_from", "desc")
        .first();

      if (!salary) {
        const error = new Error(
          `No salary structure found for employee ${user.id}`
        );

        error.code = "SALARY_STRUCTURE_NOT_FOUND";
        error.userId = user.id;
        throw error;
      }

      // GET FINAL LOP INCLUDING ADMIN ADJUSTMENTS

      const lopDays = await getFinalEmployeeLopDays({
        trx,
        userId: user.id,
        year: yearNumber,
        month: monthNumber,
      });

      // CALENDAR DAYS

      const calendarDays = new Date(
        Date.UTC(yearNumber, monthNumber, 0)
      ).getUTCDate();

      const payableDays = Math.max(
        0,
        calendarDays - lopDays
      );

      const perDay = Number(salary.gross) / calendarDays;

      const lopAmount = perDay * lopDays;

      // OTHER EARNINGS / DEDUCTIONS

      const otherEarnings = [];
      const otherDeductions = [];

      const otherEarningsTotal = otherEarnings.reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );

      const otherDeductionsTotal = otherDeductions.reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );

      const netPay =
        Number(salary.gross) -
        lopAmount +
        otherEarningsTotal -
        otherDeductionsTotal;

      // BUILD PAYROLL ITEM

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

  const id = Number(payrollRunId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll run id");
    error.code = "INVALID_ID";
    throw error;
  }

  // =================================================
  // 1. GET PAYROLL RUN
  // =================================================

  const payrollRun = await knex("payroll_runs")
    .where("id", id)
    .first();

  if (!payrollRun) {
    const error = new Error("Payroll run not found");
    error.code = "NOT_FOUND";
    throw error;
  }

  // =================================================
  // 2. GET PAYROLL ITEMS
  // =================================================

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

  // =================================================
  // 3. GET MONTH RANGE
  // =================================================

  const monthStart =
    `${payrollRun.year}-${String(payrollRun.month).padStart(2, "0")}-01`;

  const nextMonthDate = new Date(
    Date.UTC(
      Number(payrollRun.year),
      Number(payrollRun.month),
      1
    )
  );

  const endExclusive = nextMonthDate
    .toISOString()
    .slice(0, 10);

  // =================================================
  // 4. GET ALL DAY SUMMARIES
  // =================================================

  const userIds = payrollItems.map(item => item.user_id);

  let daySummaries = [];
  let adjustments = [];

  if (userIds.length > 0) {

    daySummaries = await knex("day_summaries")
      .select(
        "user_id",
        "status",
        "lop_value"
      )
      .select(
        knex.raw("work_date::text AS work_date")
      )
      .whereIn("user_id", userIds)
      .where("work_date", ">=", monthStart)
      .where("work_date", "<", endExclusive)
      .orderBy("work_date");

    // =================================================
    // 5. GET LATEST LOP ADJUSTMENTS
    // =================================================

    adjustments = await knex("attendance_lop_adjustments")
      .select(
        "id",
        "user_id",
        "new_lop",
        "previous_lop",
        "reason",
        "created_at"
      )
      .select(
        knex.raw("work_date::text AS work_date")
      )
      .whereIn("user_id", userIds)
      .where("work_date", ">=", monthStart)
      .where("work_date", "<", endExclusive)
      .orderBy("id", "desc");
  }

  // =================================================
  // 6. BUILD LATEST ADJUSTMENT MAP
  // =================================================

  const adjustmentMap = new Map();

  for (const adjustment of adjustments) {

    const date = String(adjustment.work_date).slice(0, 10);

    const key = `${adjustment.user_id}_${date}`;

    // First record is the latest because id DESC.
    if (!adjustmentMap.has(key)) {
      adjustmentMap.set(key, adjustment);
    }
  }

  // =================================================
  // 7. BUILD LOP DATE DETAILS
  // =================================================

  const summariesByUser = new Map();

  for (const day of daySummaries) {

    const userId = String(day.user_id);

    if (!summariesByUser.has(userId)) {
      summariesByUser.set(userId, []);
    }

    const date = String(day.work_date).slice(0, 10);

    const calculatedLop = Number(day.lop_value || 0);

    const key = `${userId}_${date}`;

    const adjustment = adjustmentMap.get(key);

    let finalLop = calculatedLop;
    let adjustedLop = null;

    // Apply adjustment only for ABSENT status.
    if (day.status === "ABSENT" && adjustment) {

      adjustedLop = Number(adjustment.new_lop);

      finalLop = adjustedLop;
    }

    // Include dates that originally had LOP,
    // even if the adjustment reduces LOP to zero.
    if (calculatedLop > 0 || finalLop > 0) {

      summariesByUser.get(userId).push({

        work_date: date,

        status: day.status,

        calculated_lop_value: calculatedLop.toFixed(2),

        adjusted_lop_value:
          adjustedLop === null
            ? null
            : adjustedLop.toFixed(2),

        lop_value: finalLop.toFixed(2),

        lop_adjustment:
          day.status === "ABSENT" && adjustment
            ? {
                id: adjustment.id,
                previous_lop: Number(
                  adjustment.previous_lop
                ).toFixed(2),
                new_lop: Number(
                  adjustment.new_lop
                ).toFixed(2),
                reason: adjustment.reason,
                created_at: adjustment.created_at,
              }
            : null,
      });
    }
  }

  // =================================================
  // 8. ATTACH LOP DATES TO PAYROLL ITEMS
  // =================================================

  for (const item of payrollItems) {

    item.lop_dates =
      summariesByUser.get(String(item.user_id)) || [];
  }

  // =================================================
  // 9. RESPONSE
  // =================================================

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


// UPDATE PAYROLL ITEM


async function updatePayrollItem({
  payrollItemId,
  adminId,
  otherEarnings = [],
  otherDeductions = [],
  remarks = null,
}) {

  const id = Number(payrollItemId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll item id");
    error.code = "INVALID_ID";
    throw error;
  }

  return await knex.transaction(async (trx) => {

    const payrollItem = await trx("payroll_items")
      .where("id", id)
      .first();

    if (!payrollItem) {
      const error = new Error("Payroll item not found");
      error.code = "NOT_FOUND";
      throw error;
    }

    const payrollRun = await trx("payroll_runs")
      .where("id", payrollItem.payroll_run_id)
      .first();

    if (payrollRun.status !== "DRAFT") {
      const error = new Error(
        "Payroll run has already been finalized"
      );

      error.code = "INVALID_STATE";
      throw error;
    }

    const earningsTotal = otherEarnings.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const deductionsTotal = otherDeductions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const netPay =
      Number(payrollItem.gross) -
      Number(payrollItem.lop_amount) +
      earningsTotal -
      deductionsTotal;

    const before = {
      other_earnings: payrollItem.other_earnings,
      other_deductions: payrollItem.other_deductions,
      remarks: payrollItem.remarks,
      net_pay: payrollItem.net_pay,
    };

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

    
    // 1. LOCK PAYROLL RUN

    const payrollRun = await trx("payroll_runs")
      .where("id", id)
      .forUpdate()
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

    const year = Number(payrollRun.year);
    const month = Number(payrollRun.month);

    const monthStart =
      `${year}-${String(month).padStart(2, "0")}-01`;

    const monthEnd = new Date(
      Date.UTC(year, month, 0)
    ).toISOString().slice(0, 10);

    const calendarDays = new Date(
      Date.UTC(year, month, 0)
    ).getUTCDate();

   
    // 2. LOCK EXISTING PAYROLL ITEMS

    const existingItems = await trx("payroll_items")
      .where("payroll_run_id", id)
      .forUpdate();

    const existingItemMap = new Map();

    for (const item of existingItems) {
      existingItemMap.set(
        String(item.user_id),
        item
      );
    }

    // =================================================
    // 3. GET ALL ACTIVE EMPLOYEES
    // =================================================

    const employees = await trx("users")
      .select(
        "id",
        "emp_code",
        "name",
        "role",
        "status",
        "date_of_joining"
      )
      .where("role", "EMPLOYEE")
      .where("status", "ACTIVE")
      .forUpdate();

    // Include existing payroll items too.
    // This preserves payroll records for employees
    // who may have become inactive after creation.

    const employeeMap = new Map();

    for (const employee of employees) {
      employeeMap.set(
        String(employee.id),
        employee
      );
    }

    for (const item of existingItems) {
      const userId = String(item.user_id);

      if (!employeeMap.has(userId)) {
        const employee = await trx("users")
          .where("id", item.user_id)
          .first();

        if (employee) {
          employeeMap.set(userId, employee);
        }
      }
    }

    // =================================================
    // 4. PROCESS EMPLOYEES
    // =================================================

    let updatedCount = 0;
    let insertedCount = 0;

    for (const employee of employeeMap.values()) {

      const userId = employee.id;

      // -----------------------------------------------
      // GET EFFECTIVE SALARY STRUCTURE
      // -----------------------------------------------

      const salary = await trx("salary_structures")
        .where("user_id", userId)
        .where("effective_from", "<=", monthEnd)
        .where(function () {
          this.whereNull("effective_to")
            .orWhere("effective_to", ">=", monthStart);
        })
        .orderBy("effective_from", "desc")
        .orderBy("id", "desc")
        .first();

      if (!salary) {
        const error = new Error(
          `Salary structure not found for employee ${userId}`
        );

        error.code = "SALARY_STRUCTURE_NOT_FOUND";
        error.userId = userId;

        throw error;
      }

      // -----------------------------------------------
      // GET FINAL LOP INCLUDING ADMIN ADJUSTMENTS
      // -----------------------------------------------

      const lopDays = await getFinalEmployeeLopDays({
        trx,
        userId,
        year,
        month,
      });

      // -----------------------------------------------
      // CALCULATE PAYABLE DAYS
      // -----------------------------------------------

      const payableDays = Math.max(
        0,
        calendarDays - lopDays
      );

      const gross = Number(salary.gross);

      const perDay = gross / calendarDays;

      const lopAmount = perDay * lopDays;

      // -----------------------------------------------
      // FIND EXISTING PAYROLL ITEM
      // -----------------------------------------------

      const existingItem = existingItemMap.get(
        String(userId)
      );

      // -----------------------------------------------
      // PRESERVE MANUAL ADJUSTMENTS
      // -----------------------------------------------

      let earnings = [];
      let deductions = [];
      let remarks = null;

      if (existingItem) {

        earnings = Array.isArray(existingItem.other_earnings)
          ? existingItem.other_earnings
          : typeof existingItem.other_earnings === "string"
            ? JSON.parse(existingItem.other_earnings || "[]")
            : [];

        deductions = Array.isArray(existingItem.other_deductions)
          ? existingItem.other_deductions
          : typeof existingItem.other_deductions === "string"
            ? JSON.parse(existingItem.other_deductions || "[]")
            : [];

        remarks = existingItem.remarks || null;
      }

      const earningsTotal = earnings.reduce(
        (sum, earning) =>
          sum + Number(earning.amount || 0),
        0
      );

      const deductionsTotal = deductions.reduce(
        (sum, deduction) =>
          sum + Number(deduction.amount || 0),
        0
      );

      // -----------------------------------------------
      // CALCULATE NET PAY
      // -----------------------------------------------

      const netPay =
        gross -
        lopAmount +
        earningsTotal -
        deductionsTotal;

      // -----------------------------------------------
      // PAYROLL ITEM DATA
      // -----------------------------------------------

      const payrollItemData = {
        gross,
        calendar_days: calendarDays,
        payable_days: payableDays,
        lop_days: lopDays,
        per_day: Number(perDay.toFixed(2)),
        lop_amount: Number(lopAmount.toFixed(2)),
        net_pay: Number(netPay.toFixed(2)),
        updated_at: trx.fn.now(),
      };

      // -----------------------------------------------
      // UPDATE EXISTING ITEM
      // -----------------------------------------------

      if (existingItem) {

        await trx("payroll_items")
          .where("id", existingItem.id)
          .update(payrollItemData);

        updatedCount++;

      } else {

        // ---------------------------------------------
        // INSERT MISSING PAYROLL ITEM
        // ---------------------------------------------

        await trx("payroll_items").insert({
          payroll_run_id: id,
          user_id: userId,

          ...payrollItemData,

          other_earnings: JSON.stringify([]),
          other_deductions: JSON.stringify([]),

          remarks: null,

          created_at: trx.fn.now(),
        });

        insertedCount++;
      }
    }

    // =================================================
    // 5. AUDIT LOG
    // =================================================

    const totalItems = updatedCount + insertedCount;

    await trx("audit_log").insert({
      actor_id: adminId,
      action: "PAYROLL_RUN_RECOMPUTED",
      entity_type: "payroll_runs",
      entity_id: id,
      before: null,
      after: JSON.stringify({
        payroll_run_id: id,
        updated_items: updatedCount,
        inserted_items: insertedCount,
        total_items: totalItems,
      }),
      reason: "Payroll recomputed after attendance changes",
    });

    // =================================================
    // 6. RESPONSE
    // =================================================

    return {
      success: true,
      message: "Payroll recomputed successfully",
      data: {
        payroll_run_id: id,
        updated_items: updatedCount,
        inserted_items: insertedCount,
        total_items: totalItems,
      },
    };
  });
}


// BUILD PAYSLIP DATA


async function buildPayslipData({
  trx,
  user,
  payrollRun,
  payrollItem,
}) {

  const year = Number(payrollRun.year);
  const month = Number(payrollRun.month);

  const monthStart =
    `${year}-${String(month).padStart(2, "0")}-01`;

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
      this.whereNull("effective_to")
        .orWhere("effective_to", ">=", monthStart);
    })
    .orderBy("effective_from", "desc")
    .first();

  // EARNINGS

  const earnings = [];

  if (salaryStructure) {

    const basic = Number(salaryStructure.basic || 0);
    const hra = Number(salaryStructure.hra || 0);
    const da = Number(salaryStructure.da || 0);

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

    if (da > 0) {
      earnings.push({
        label: "DA",
        amount: da,
      });
    }

    if (specialAllowance > 0) {
      earnings.push({
        label: "Special Allowance",
        amount: specialAllowance,
      });
    }
  }

  const otherEarnings = Array.isArray(payrollItem.other_earnings)
    ? payrollItem.other_earnings
    : typeof payrollItem.other_earnings === "string"
      ? JSON.parse(payrollItem.other_earnings || "[]")
      : [];

  for (const earning of otherEarnings) {
    earnings.push({
      label: earning.label || "Other Earnings",
      amount: Number(earning.amount) || 0,
    });
  }

  // DEDUCTIONS

  const deductions = [];

  const lopAmount = Number(payrollItem.lop_amount) || 0;

  if (lopAmount > 0) {
    deductions.push({
      label: "LOP Deduction",
      amount: lopAmount,
    });
  }

  const otherDeductions = Array.isArray(payrollItem.other_deductions)
    ? payrollItem.other_deductions
    : typeof payrollItem.other_deductions === "string"
      ? JSON.parse(payrollItem.other_deductions || "[]")
      : [];

  for (const deduction of otherDeductions) {
    deductions.push({
      label: deduction.label || "Other Deduction",
      amount: Number(deduction.amount) || 0,
    });
  }

  // TOTALS

  const grossEarnings = Number(payrollItem.gross) || 0;

  const totalDeductions = deductions.reduce(
    (total, deduction) =>
      total + Number(deduction.amount || 0),
    0
  );

  const netPay = Number(payrollItem.net_pay) || 0;

  // COMPANY

  const company = {
    name:
      process.env.COMPANY_NAME ||
      "NANDGATE IT SERVICES PVT LTD",

    location:
      process.env.COMPANY_LOCATION || "",
  };

  // EMPLOYEE

  const employee = {
    name: user.name || "-",
    designation: user.designation || "-",
    employeeId: user.emp_code || "-",
    dateOfJoining: user.date_of_joining || null,
  };

  // PAYROLL

  const payroll = {
    month,
    year,
    calendarDays: payrollItem.calendar_days ?? 0,
    paidDays: payrollItem.payable_days ?? 0,
    lopDays: payrollItem.lop_days ?? 0,
    payDate: null,
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



// =====================================================
// FINALIZE PAYROLL RUN + PUBLISH / UPDATE PAYSLIPS
// + NOTIFICATIONS
// =====================================================

async function finalizePayrollRun({
  payrollRunId,
  adminId,
}) {
  const id = Number(payrollRunId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll run id");
    error.code = "INVALID_ID";
    throw error;
  }

  const generatedFiles = [];
  const oldFilesToDelete = [];

  try {
    const result = await knex.transaction(async (trx) => {

      // =================================================
      // 1. GET AND LOCK PAYROLL RUN
      // =================================================

      const payrollRun = await trx("payroll_runs")
        .where("id", id)
        .forUpdate()
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

      // =================================================
      // 2. GET AND LOCK PAYROLL ITEMS
      // =================================================

      const payrollItems = await trx("payroll_items")
        .where("payroll_run_id", id)
        .orderBy("id")
        .forUpdate();

      if (payrollItems.length === 0) {
        const error = new Error(
          "Payroll run has no payroll items"
        );

        error.code = "INVALID_STATE";
        throw error;
      }

      let insertedPayslips = 0;
      let updatedPayslips = 0;
      let notificationsCreated = 0;

      // =================================================
      // 3. GENERATE OR UPDATE PAYSLIPS
      // =================================================

      for (const item of payrollItems) {

        // GET EMPLOYEE

        const user = await trx("users")
          .where("id", item.user_id)
          .first();

        if (!user) {
          const error = new Error(
            `Employee not found for payroll item ${item.id}`
          );

          error.code = "NOT_FOUND";
          throw error;
        }

        // CHECK EXISTING PAYSLIP

        const existingPayslip = await trx("payslips")
          .where("payroll_item_id", item.id)
          .forUpdate()
          .first();

        // BUILD UPDATED PAYSLIP DATA

        const payslipData = await buildPayslipData({
          trx,
          user,
          payrollRun,
          payrollItem: item,
        });

        // FILE NAME

        const baseFileName =
          `payslip-${user.emp_code}-${payrollRun.year}-${String(
            payrollRun.month
          ).padStart(2, "0")}-${item.id}`;

        // Existing payslips get a new filename.
        // This protects the old PDF until transaction commit.

        const fileName = existingPayslip
          ? `${baseFileName}-revised.pdf`
          : `${baseFileName}.pdf`;

        const relativePath = path.join(
          "uploads",
          "payslips",
          String(payrollRun.year),
          String(payrollRun.month).padStart(2, "0"),
          fileName
        );

        const filePath = path.join(
          process.cwd(),
          relativePath
        );

        // GENERATE PDF

        await generatePayslipPdf({
          payslipData,
          filePath,
        });

        generatedFiles.push(filePath);

        let payslip;

        // =================================================
        // 4. UPDATE EXISTING PAYSLIP
        // =================================================

        if (existingPayslip) {

          // Preserve the existing payslip ID.

          await trx("payslips")
            .where("id", existingPayslip.id)
            .update({
              pdf_path: relativePath,
              published_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });

          payslip = {
            ...existingPayslip,
            pdf_path: relativePath,
          };

          updatedPayslips++;

          // Save old PDF path for cleanup after commit.

          if (existingPayslip.pdf_path) {
            const oldFilePath = path.resolve(
              process.cwd(),
              existingPayslip.pdf_path
            );

            if (oldFilePath !== path.resolve(filePath)) {
              oldFilesToDelete.push(oldFilePath);
            }
          }

        } else {

          // =================================================
          // 5. INSERT NEW PAYSLIP
          // =================================================

          const [newPayslip] = await trx("payslips")
            .insert({
              payroll_item_id: item.id,
              user_id: item.user_id,
              month: payrollRun.month,
              year: payrollRun.year,
              pdf_path: relativePath,
              published_at: trx.fn.now(),
            })
            .returning([
              "id",
              "payroll_item_id",
              "user_id",
              "month",
              "year",
              "pdf_path",
              "published_at",
            ]);

          payslip = newPayslip;

          insertedPayslips++;
        }

        // =================================================
        // 6. CHECK EXISTING NOTIFICATION
        // =================================================

        const existingNotification = await trx("notifications")
          .where({
            user_id: user.id,
            type: "PAYSLIP_PUBLISHED",
            entity_type: "payslip",
            entity_id: payslip.id,
          })
          .first();

        // =================================================
        // 7. CREATE NOTIFICATION IF NOT ALREADY PRESENT
        // =================================================

        if (!existingNotification) {

          await notifyUser(trx, {
            userId: user.id,
            actorId: adminId,

            type: "PAYSLIP_PUBLISHED",

            title: "Payslip Published",

            message:
              `Your payslip for ${String(
                payrollRun.month
              ).padStart(2, "0")}/${payrollRun.year} has been published. You can now view and download it.`,

            entityId: payslip.id,

            data: {
              employee_id: user.id,
              employee_name: user.name,
              emp_code: user.emp_code,

              payslip_id: payslip.id,
              payroll_item_id: item.id,
              payroll_run_id: payrollRun.id,

              month: payrollRun.month,
              year: payrollRun.year,

              published_at: payslip.published_at,
            },
          });

          notificationsCreated++;
        }
      }

      // =================================================
      // 8. LOCK DAY SUMMARIES
      // =================================================

      const lockedCount = await trx("day_summaries")
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
          updated_at: trx.fn.now(),
        });

      // =================================================
      // 9. FINALIZE PAYROLL RUN
      // =================================================

      await trx("payroll_runs")
        .where("id", id)
        .update({
          status: "FINALIZED",
          finalized_by: adminId,
          finalized_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      // =================================================
      // 10. AUDIT LOG
      // =================================================

      await trx("audit_log").insert({
        actor_id: adminId,
        action: "PAYROLL_FINALIZED",
        entity_type: "payroll_runs",
        entity_id: id,

        before: JSON.stringify({
          status: "DRAFT",
        }),

        after: JSON.stringify({
          status: "FINALIZED",
          payroll_run_id: id,
          total_employees: payrollItems.length,
          payslips_inserted: insertedPayslips,
          payslips_updated: updatedPayslips,
          notifications_created: notificationsCreated,
          day_summaries_locked: lockedCount,
        }),

        reason: "Payroll run finalized and payslips published",
      });

      // =================================================
      // 11. RESPONSE
      // =================================================

      return {
        success: true,
        message: "Payroll finalized successfully",

        data: {
          payroll_run_id: id,
          status: "FINALIZED",

          total_employees: payrollItems.length,

          payslips_generated:
            insertedPayslips + updatedPayslips,

          payslips_inserted: insertedPayslips,
          payslips_updated: updatedPayslips,

          notifications_created: notificationsCreated,

          day_summaries_locked: lockedCount,
        },
      };
    });

    // ===================================================
    // 12. DELETE OLD PDF FILES AFTER COMMIT
    // ===================================================

    for (const oldFilePath of oldFilesToDelete) {
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (cleanupError) {
        console.error(
          "Failed to remove old payslip PDF:",
          oldFilePath,
          cleanupError
        );
      }
    }

    return result;

  } catch (error) {

    // ===================================================
    // 13. CLEAN UP NEW PDF FILES IF TRANSACTION FAILS
    // ===================================================

    for (const filePath of generatedFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupError) {
        console.error(
          "Failed to cleanup generated payslip PDF:",
          cleanupError
        );
      }
    }

    throw error;
  }
}

// DATE FORMATTER


function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// EXPORT PAYROLL RUN


async function exportPayrollRun({ payrollRunId }) {

  const id = Number(payrollRunId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid payroll run id");
    error.code = "INVALID_ID";
    throw error;
  }

  const payrollRun = await knex("payroll_runs")
    .where("id", id)
    .first();

  if (!payrollRun) {
    const error = new Error("Payroll run not found");
    error.code = "NOT_FOUND";
    throw error;
  }

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

  const workbook = new ExcelJS.Workbook();

  const worksheet = workbook.addWorksheet("Payroll Register");

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

  worksheet.getRow(1).font = {
    bold: true,
  };

  payrollItems.forEach((item) => {
    worksheet.addRow(item);
  });

  ["D", "H", "I", "J"].forEach((column) => {
    worksheet.getColumn(column).numFmt = "#,##0.00";
  });

  const fileName =
    `Payroll_${payrollRun.month}_${payrollRun.year}.xlsx`;

  return {
    workbook,
    fileName,
  };
}

// GET MY PAYSLIPS


async function getMyPayslips({ userId }) {

  const payslips = await knex({ p: "payslips" })
    .select(
      "p.id",
      "p.month",
      "p.year",
      "p.published_at",
      "p.created_at"
    )
    .select(
      knex("salary_structures as ss")
        .select("ss.da")
        .whereColumn("ss.user_id", "p.user_id")
        .whereRaw(
          "ss.effective_from <= make_date(??, ??, 1) + interval '1 month - 1 day'",
          ["p.year", "p.month"]
        )
        .where(function () {
          this.whereNull("ss.effective_to").orWhereRaw(
            "ss.effective_to >= make_date(??, ??, 1)",
            ["p.year", "p.month"]
          );
        })
        .orderBy("ss.effective_from", "desc")
        .orderBy("ss.id", "desc")
        .limit(1)
        .as("da")
    )
    .where("p.user_id", userId)
    .whereNotNull("p.published_at")
    .orderBy([
      {
        column: "p.year",
        order: "desc",
      },
      {
        column: "p.month",
        order: "desc",
      },
    ]);

  const data = payslips.map((payslip) => ({
    id: payslip.id,
    month: payslip.month,
    year: payslip.year,
    da: Number(payslip.da || 0),
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
    const error = new Error("Invalid payslip id");
    error.code = "INVALID_ID";
    throw error;
  }

  const payslip = await knex("payslips")
    .where({
      id,
      user_id: userId,
    })
    .whereNotNull("published_at")
    .first();

  if (!payslip) {
    const error = new Error("Payslip not found");
    error.code = "NOT_FOUND";
    throw error;
  }

  const filePath = path.resolve(
    payslip.pdf_path
  );

  if (!fs.existsSync(filePath)) {
    const error = new Error("Payslip PDF not found");
    error.code = "NOT_FOUND";
    throw error;
  }

  return {
    filePath,
    fileName: path.basename(filePath),
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
  downloadMyPayslip,
  getFinalEmployeeLopDays,
};
