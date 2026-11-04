const knex = require("../config/database");
const validatorSettings = require("../utils/validators");
const { recomputeDay } = require("../services/attendanceService");

// VALIDATE SETTING VALUE

function validateSettingValue(key, value) {
  // SHIFT

  if (key === "shift") {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.start !== "string" ||
      typeof value.end !== "string"
    ) {
      const error = new Error("shift must contain start and end times");

      error.code = "INVALID_SETTING_VALUE";
      error.key = key;

      throw error;
    }

    return;
  }

  // WEEKLY OFF DAYS

  if (key === "weekly_off_days") {
    if (
      !Array.isArray(value) ||
      value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    ) {
      const error = new Error(
        "weekly_off_days must contain numbers from 0 to 6",
      );

      error.code = "INVALID_SETTING_VALUE";
      error.key = key;

      throw error;
    }

    return;
  }

  // PAYROLL DIVISOR

  if (key === "payroll_divisor") {
    if (typeof value !== "string" || value !== "CALENDAR_DAYS") {
      const error = new Error("payroll_divisor must be CALENDAR_DAYS");

      error.code = "INVALID_SETTING_VALUE";
      error.key = key;

      throw error;
    }

    return;
  }

  // NUMERIC SETTINGS

  const numericKeys = [
    "break_allowance_min",
    "grace_min",
    "full_day_hours",
    "half_day_hours",
    "duplicate_punch_window_min",
    "permission_monthly_min",
    "permission_unit_min",
    "leave_monthly_accrual",
    "leave_balance_cap",
  ];

  if (numericKeys.includes(key)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      const error = new Error(`${key} must be a non-negative number`);

      error.code = "INVALID_SETTING_VALUE";
      error.key = key;

      throw error;
    }
  }
}

// GET SETTINGS

async function getSettings() {
  const rows = await knex("settings")
    .select("key", "value")
    .orderBy("key", "asc");

  const settings = {};

  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return {
    success: true,

    message: "Settings fetched successfully",

    data: {
      settings,
    },
  };
}

// UPDATE SETTINGS

async function updateSettings({ adminId, settings }) {
  // VALIDATE REQUEST

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    const error = new Error("settings must be an object");

    error.code = "INVALID_SETTINGS";

    throw error;
  }

  const allowedKeys = new Set([
    "shift",
    "break_allowance_min",
    "grace_min",
    "full_day_hours",
    "half_day_hours",
    "weekly_off_days",
    "duplicate_punch_window_min",
    "permission_monthly_min",
    "permission_unit_min",
    "leave_monthly_accrual",
    "leave_balance_cap",
    "payroll_divisor",
  ]);

  const keys = Object.keys(settings);

  if (keys.length === 0) {
    const error = new Error("At least one setting is required");

    error.code = "INVALID_SETTINGS";

    throw error;
  }

  // VALIDATE SETTING KEYS

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      const error = new Error(`Invalid setting key: ${key}`);

      error.code = "INVALID_SETTING_KEY";

      throw error;
    }
  }

  // VALIDATE VALUES

  for (const key of keys) {
    validateSettingValue(key, settings[key]);
  }

  // TRANSACTION

  return await knex.transaction(async (trx) => {
    const changes = [];

    for (const key of keys) {
      // GET CURRENT VALUE

      const existing = await trx("settings")
        .where("key", key)
        .first(["key", "value"]);

      const before = existing ? existing.value : null;

      const after = settings[key];

      // INSERT OR UPDATE

      if (existing) {
        await trx("settings")
          .where("key", key)
          .update({
            value: JSON.stringify(after),
          });
      } else {
        await trx("settings").insert({
          key,
          value: JSON.stringify(after),
        });
      }

      // AUDIT

      const [audit] = await trx("audit_log")
        .insert({
          actor_id: adminId,

          action: "SETTING_CHANGED",

          entity_type: "settings",

          entity_id: null,

          before: JSON.stringify({
            key,
            value: before,
          }),

          after: JSON.stringify({
            key,
            value: after,
          }),

          reason: `Setting ${key} changed`,
        })
        .returning(["id"]);

      changes.push({
        key,

        before,

        after,

        audit_id: audit.id,
      });
    }

    // RESPONSE

    return {
      success: true,

      message: "Settings updated successfully",

      data: {
        updated_count: changes.length,

        changes,
      },
    };
  });
}

// VALIDATE HOLIDAY DATE

function validateDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error("holiday_date must be in YYYY-MM-DD format");

    error.code = "INVALID_HOLIDAY_DATE";

    throw error;
  }

  // Validate that the date actually exists.
  // Example: 2026-02-30 should fail.

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    const error = new Error("Invalid holiday date");

    error.code = "INVALID_HOLIDAY_DATE";

    throw error;
  }

  return value;
}

// VALIDATE HOLIDAY NAME

function validateHolidayName(name) {
  if (typeof name !== "string" || !name.trim()) {
    const error = new Error("Holiday name is required");

    error.code = "INVALID_HOLIDAY_NAME";

    throw error;
  }

  const trimmedName = name.trim();

  if (trimmedName.length > 80) {
    const error = new Error("Holiday name cannot exceed 80 characters");

    error.code = "INVALID_HOLIDAY_NAME";

    throw error;
  }

  return trimmedName;
}

// VALIDATE YEAR

function validateYear(year) {
  if (year === undefined || year === null || year === "") {
    const error = new Error("year is required");

    error.code = "INVALID_YEAR";

    throw error;
  }

  const numericYear = Number(year);

  if (
    !Number.isInteger(numericYear) ||
    numericYear < 2000 ||
    numericYear > 2100
  ) {
    const error = new Error("Invalid year");

    error.code = "INVALID_YEAR";

    throw error;
  }

  return numericYear;
}

// VALIDATE HOLIDAY ID

function validateHolidayId(holidayId) {
  const numericId = Number(holidayId);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    const error = new Error("Invalid holiday id");

    error.code = "INVALID_HOLIDAY_ID";

    throw error;
  }

  return numericId;
}

// VALIDATE ADMIN

async function validateAdmin(trx, adminId) {
  const admin = await trx("users")
    .select("id")
    .where({
      id: adminId,
      role: "ADMIN",
      status: "ACTIVE",
    })
    .first();

  if (!admin) {
    const error = new Error("Admin not found");

    error.code = "ADMIN_NOT_FOUND";

    throw error;
  }
}

// CHECK MONTH LOCK

//
// day_summaries.is_locked = true means the month containing
// this work_date has been finalized.
//
// Because day_summaries has one row per employee/day, we only
// need to know whether ANY row for this date is locked.

async function checkMonthLocked(trx, workDate) {
  const lockedSummary = await trx("day_summaries")
    .select("id", "user_id", "work_date")
    .where("work_date", workDate)
    .where("is_locked", true)
    .first();

  if (lockedSummary) {
    const error = new Error(`Month is locked for ${workDate}`);

    error.code = "MONTH_LOCKED";

    error.lockedDate = workDate;

    throw error;
  }
}

// GET ACTIVE EMPLOYEES

async function getActiveEmployees(trx) {
  return await trx("users")
    .select("id")
    .where({
      status: "ACTIVE",
      role: "EMPLOYEE",
    })
    .orderBy("id", "asc");
}


// GET HOLIDAYS

async function getHolidays({ year }) {
  const numericYear = validateYear(year);

  const holidays = await knex("holidays")
    .select(
      "id",
      knex.raw("holiday_date::text as holiday_date"),
      "name",
      "year",
      "created_at",
      "updated_at"
    )
    .where("year", numericYear)
    .orderBy("holiday_date", "asc");

  return {
    success: true,
    message: "Holidays fetched successfully",
    data: {
      year: numericYear,
      holidays,
    },
  };
}

// CREATE HOLIDAY

async function createHoliday({ adminId, holiday_date, name }) {
  // --------------------------------------------
  // VALIDATE INPUT
  // --------------------------------------------

  const holidayDate = validateDateOnly(holiday_date);

  const holidayName = validateHolidayName(name);

  const holidayYear = Number(holidayDate.substring(0, 4));

  // --------------------------------------------
  // TRANSACTION
  // --------------------------------------------

  return await knex.transaction(async (trx) => {
    // ----------------------------------------
    // VALIDATE ADMIN
    // ----------------------------------------

    await validateAdmin(trx, adminId);

    // ----------------------------------------
    // CHECK MONTH LOCK
    // ----------------------------------------

    await checkMonthLocked(trx, holidayDate);

    // ----------------------------------------
    // CHECK DUPLICATE HOLIDAY
    // ----------------------------------------

    const existing = await trx("holidays")
      .select("id", "holiday_date", "name", "year")
      .where("holiday_date", holidayDate)
      .first();

    if (existing) {
      const error = new Error("Holiday already exists for this date");

      error.code = "HOLIDAY_ALREADY_EXISTS";

      throw error;
    }

    // ----------------------------------------
    // INSERT HOLIDAY
    // ----------------------------------------

    const [holiday] = await trx("holidays")
      .insert({
        holiday_date: holidayDate,

        name: holidayName,

        year: holidayYear,
      })
      .returning([
        "id",
        "holiday_date",
        "name",
        "year",
        "created_at",
        "updated_at",
      ]);

    // ----------------------------------------
    // GET ACTIVE EMPLOYEES ONLY
    // ----------------------------------------

    const employees = await getActiveEmployees(trx);

    // ----------------------------------------
    // REWRITE DAY SUMMARIES
    // ----------------------------------------
    //
    // Every active employee gets this date
    // marked as HOLIDAY.
    //
    // Admin users are NOT included.
    // ----------------------------------------

    for (const employee of employees) {
      await rewriteHolidayDaySummary({
        trx,

        userId: employee.id,

        workDate: holidayDate,
      });
    }

    // ----------------------------------------
    // AUDIT LOG
    // ----------------------------------------

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,

        action: "HOLIDAY_ADDED",

        entity_type: "holidays",

        entity_id: holiday.id,

        before: null,

        after: {
          id: holiday.id,

          holiday_date: holidayDate,

          name: holidayName,

          year: holidayYear,
        },

        reason: `Holiday added: ${holidayName}`,
      })
      .returning(["id"]);

    // ----------------------------------------
    // RESPONSE
    // ----------------------------------------

 return {
  success: true,
  message: "Holiday added successfully",
  data: {
    holiday: {
      ...holiday,
      holiday_date: holidayDate,
    },
    affected_users: employees.length,
    audit_id: audit.id,
  },
};
  });
}

// ============================================================
// REWRITE DAY SUMMARY AS HOLIDAY
// ============================================================
//
// This function changes the affected employee/date to:
//
// status = HOLIDAY
// work_min = 0
// break_min = 0
// permission_min = 0
// lop_value = 0
//
// ============================================================

async function rewriteHolidayDaySummary({ trx, userId, workDate }) {
  const existing = await trx("day_summaries")
    .select("id")
    .where({
      user_id: userId,

      work_date: workDate,
    })
    .first();

  const summaryValues = {
    status: "HOLIDAY",

    first_in: null,

    last_out: null,

    work_min: 0,

    break_min: 0,

    permission_min: 0,

    is_late: false,

    excess_break: false,

    needs_regularization: false,

    lop_value: 0,

    is_locked: false,
  };

  // --------------------------------------------
  // UPDATE EXISTING SUMMARY
  // --------------------------------------------

  if (existing) {
    await trx("day_summaries").where("id", existing.id).update(summaryValues);

    return;
  }

  // --------------------------------------------
  // INSERT SUMMARY
  // --------------------------------------------

  await trx("day_summaries").insert({
    user_id: userId,

    work_date: workDate,

    ...summaryValues,
  });
}

// DELETE HOLIDAY

async function deleteHoliday({ adminId, holidayId }) {
  const numericHolidayId = validateHolidayId(holidayId);

  return await knex.transaction(async (trx) => {
  
    // VALIDATE ADMIN
    

    await validateAdmin(trx, adminId);

  
    // GET HOLIDAY

    const holiday = await trx("holidays")
      .select(
        "id",
        trx.raw("holiday_date::text as holiday_date"),
        "name",
        "year",
        "created_at",
        "updated_at",
      )
      .where("id", numericHolidayId)
      .first();

    if (!holiday) {
      const error = new Error("Holiday not found");

      error.code = "HOLIDAY_NOT_FOUND";

      throw error;
    }

    // PostgreSQL DATE should normally come back as
    // YYYY-MM-DD, but normalize it anyway.

    const holidayDate = String(holiday.holiday_date).slice(0, 10);

    // CHECK MONTH LOCK

    await checkMonthLocked(trx, holidayDate);

    // DELETE HOLIDAY

    await trx("holidays").where("id", numericHolidayId).del();

    // GET ACTIVE EMPLOYEES ONLY

    const employees = await getActiveEmployees(trx);

    // RECOMPUTE DAY SUMMARIES

    //
    // IMPORTANT:
    //
    // We DO NOT simply set status = ABSENT.
    //
    // The date could actually be:
    //
    // PRESENT
    // HALF_DAY
    // ABSENT
    // LEAVE
    // WEEKLY_OFF
    // INSUFFICIENT
    //
    // Therefore use the normal attendance
    // computation.
    // ----------------------------------------

    for (const employee of employees) {
      await recomputeDay(employee.id, holidayDate, trx);
    }

    // AUDIT LOG

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,

        action: "HOLIDAY_DELETED",

        entity_type: "holidays",

        entity_id: holiday.id,

        before: {
          id: holiday.id,

          holiday_date: holidayDate,

          name: holiday.name,

          year: holiday.year,
        },

        after: null,

        reason: `Holiday deleted: ${holiday.name}`,
      })
      .returning(["id"]);

    // RESPONSE

    return {
      success: true,

      message: "Holiday deleted successfully",

      data: {
        holiday: {
          id: holiday.id,

          holiday_date: holidayDate,

          name: holiday.name,

          year: holiday.year,
        },

        affected_users: employees.length,

        audit_id: audit.id,
      },
    };
  });
}

module.exports = {
  getSettings,
  updateSettings,
  validateSettingValue,
  deleteHoliday,
  createHoliday,
  getHolidays,
  validateDateOnly,
  validateHolidayName,
  validateYear,
  validateHolidayId,
  validateAdmin,
  checkMonthLocked,
  getActiveEmployees,
  rewriteHolidayDaySummary,
};
