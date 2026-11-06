
const cron = require("node-cron");
const knex = require("../config/database");

const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

// DATE HELPERS


function getLocalDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function getFirstDayOfNextMonth(dateString) {
  const [year, month] = dateString.split("-").map(Number);

  const nextMonth = new Date(Date.UTC(year, month, 1));

  return [
    nextMonth.getUTCFullYear(),
    String(nextMonth.getUTCMonth() + 1).padStart(2, "0"),
    "01"
  ].join("-");
}


// PROCESS LEAVE ACCRUALS


async function processLeaveAccruals(asOfDate = getLocalDateString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    throw new Error("Invalid accrual date. Expected YYYY-MM-DD.");
  }

  const year = Number(asOfDate.slice(0, 4));
  const currentMonth = Number(asOfDate.slice(5, 7));

  const yearStart = `${year}-01-01`;

  const summary = {
    processed_employees: 0,
    annual_resets: 0,
    monthly_accruals: 0,
    already_processed: 0,
    missing_joining_date: 0
  };

  const employees = await knex("users")
    .select("id", "date_of_joining")
    .whereRaw("UPPER(role) = ?", ["EMPLOYEE"])
    .whereRaw("UPPER(status) = ?", ["ACTIVE"])
    .orderBy("id", "asc");

  for (const employee of employees) {
    await knex.transaction(async (trx) => {
      // Lock employee row to prevent concurrent processing.
      const lockedEmployee = await trx("users")
        .select("id", "date_of_joining")
        .where({ id: employee.id })
        .forUpdate()
        .first();

      if (!lockedEmployee) {
        return;
      }

      if (!lockedEmployee.date_of_joining) {
        summary.missing_joining_date += 1;
        return;
      }

      const joiningDate = String(
        lockedEmployee.date_of_joining
      ).slice(0, 10);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
        summary.missing_joining_date += 1;
        return;
      }

      // First eligible accrual is the month after joining.
      const firstEligibleDate =
        getFirstDayOfNextMonth(joiningDate);


      // ANNUAL RESET


      const existingReset = await trx("leave_ledger")
        .select("id")
        .where({
          user_id: employee.id,
          entry_date: yearStart,
          type: "YEAR_RESET"
        })
        .first();

      if (!existingReset) {
        const previousYearLedger = await trx("leave_ledger")
          .sum({ balance: "delta" })
          .where({ user_id: employee.id })
          .where("entry_date", "<", yearStart)
          .first();

        const previousYearBalance = Number(
          previousYearLedger?.balance ?? 0
        );

        // Expire unused positive leave.
        // A negative balance is not carried into the new year.
        const resetDelta = previousYearBalance > 0
          ? -previousYearBalance
          : 0;

        await trx("leave_ledger").insert({
          user_id: employee.id,
          entry_date: yearStart,
          delta: resetDelta,
          type: "YEAR_RESET",
          leave_request_id: null,
          note: `Expired unused leave balance at the start of ${year}`
        });

        summary.annual_resets += 1;
      } else {
        summary.already_processed += 1;
      }


      // MONTHLY ACCRUAL
  

      for (let month = 1; month <= currentMonth; month += 1) {
        const monthStart =
          `${year}-${String(month).padStart(2, "0")}-01`;

        // Do not credit before the first eligible month.
        if (monthStart < firstEligibleDate) {
          continue;
        }

        const existingAccrual = await trx("leave_ledger")
          .select("id")
          .where({
            user_id: employee.id,
            entry_date: monthStart,
            type: "ACCRUAL"
          })
          .first();

        if (existingAccrual) {
          summary.already_processed += 1;
          continue;
        }

        await trx("leave_ledger").insert({
          user_id: employee.id,
          entry_date: monthStart,
          delta: 1,
          type: "ACCRUAL",
          leave_request_id: null,
          note: `Monthly leave accrual for ${monthStart.slice(0, 7)}`
        });

        summary.monthly_accruals += 1;
      }

      summary.processed_employees += 1;
    });
  }

  return summary;
}

// START LEAVE ACCRUAL WORKER


function startLeaveAccrualWorker() {
  // Keep track of startup recovery so shutdown can wait for it.
  const startupPromise = processLeaveAccruals()
    .then((result) => {
      console.log(
        "Leave accrual startup check completed:",
        result
      );
    })
    .catch((error) => {
      console.error(
        "Leave accrual startup check failed:",
        error
      );
    });

  // Run at midnight on the first day of every month.
  const task = cron.schedule(
    "0 0 1 * *",
    async () => {
      try {
        const result = await processLeaveAccruals();

        console.log(
          "Monthly leave accrual completed:",
          result
        );
      } catch (error) {
        console.error(
          "Monthly leave accrual failed:",
          error
        );
      }
    },
    {
      timezone: TIMEZONE
    }
  );

  console.log(
    `Leave accrual worker started (${TIMEZONE}).`
  );

  return async function stopLeaveAccrualWorker() {
    task.stop();

    // Wait for startup recovery before closing the database.
    await startupPromise;

    console.log("Leave accrual worker stopped.");
  };
}

// EXPORTS

module.exports = {
  startLeaveAccrualWorker,
  processLeaveAccruals
};
