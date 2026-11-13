
const knex = require("../config/database");

const {
  checkMonthLocked,
  validateAdmin,
  validateDateOnly,
  validateYear,
} = require("./settingsService");

const { recomputeDay } = require("./AttendanceService");

// =====================================================
// COMMON ERROR HANDLER
// =====================================================

function invalidSwap(message, code = "INVALID_WORKDAY_SWAP") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

// =====================================================
// VALIDATE EMPLOYEE IDS
// =====================================================

function validateEmployeeIds(userIds) {
  if (
    !Array.isArray(userIds) ||
    userIds.length === 0 ||
    userIds.some(
      (id) =>
        !Number.isSafeInteger(Number(id)) ||
        Number(id) <= 0
    )
  ) {
    invalidSwap(
      "user_ids must be a non-empty array of employee IDs"
    );
  }

  const normalizedIds = userIds.map(Number);

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    invalidSwap("user_ids cannot contain duplicates");
  }

  return normalizedIds;
}

// =====================================================
// VALIDATE REASON
// =====================================================

function validateReason(reason) {
  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > 500
  ) {
    invalidSwap(
      "reason is required and cannot exceed 500 characters"
    );
  }

  return reason.trim();
}

// =====================================================
// VALIDATE SWAP DATE
// =====================================================

function validateSwapDate(value, field) {
  try {
    return validateDateOnly(value);
  } catch (error) {
    if (error.code !== "INVALID_HOLIDAY_DATE") {
      throw error;
    }

    invalidSwap(
      `${field} must be a valid date in YYYY-MM-DD format`,
      "INVALID_WORKDAY_SWAP_DATE"
    );
  }
}

// =====================================================
// GET WEEKLY OFF DAYS
// =====================================================

async function getWeeklyOffDays(trx) {
  const row = await trx("settings")
    .where({ key: "weekly_off_days" })
    .first();

  if (!row) {
    return [0, 6];
  }

  let value = row.value;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      invalidSwap(
        "The configured weekly off days setting is invalid"
      );
    }
  }

  if (
    !Array.isArray(value) ||
    value.some(
      (day) =>
        !Number.isInteger(Number(day)) ||
        Number(day) < 0 ||
        Number(day) > 6
    )
  ) {
    invalidSwap(
      "The configured weekly off days setting is invalid"
    );
  }

  return value.map(Number);
}

// =====================================================
// GET DAY OF WEEK
// =====================================================

function getDayOfWeek(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// =====================================================
// FORMAT GROUP DATES
// =====================================================

function formatGroupDates(group) {
  return {
    ...group,
    holiday_date: group.holiday_date,
    replacement_date: group.replacement_date,
  };
}

// =====================================================
// GET SWAP WITH EMPLOYEES
// =====================================================

async function getSwapWithEmployees(trx, group) {
  const employees = await trx("workday_swap_employees")
    .join(
      "users",
      "users.id",
      "workday_swap_employees.user_id"
    )
    .where("workday_swap_employees.group_id", group.id)
    .select(
      "users.id",
      "users.emp_code",
      "users.name"
    )
    .orderBy("users.emp_code", "asc");

  return {
    ...formatGroupDates(group),
    employees,
  };
}

// =====================================================
// GET WORKDAY SWAPS
// SUPPORTS CROSS-YEAR LISTING
// =====================================================

async function getWorkdaySwaps({ year }) {
  const numericYear = validateYear(year);

  const groups = await knex("workday_swap_groups")
    .select(
      "id",
      knex.raw("holiday_date::text as holiday_date"),
      knex.raw("replacement_date::text as replacement_date"),
      "reason",
      "created_by",
      "created_at",
      "updated_at"
    )
    .where(function () {
      this.whereRaw(
        "EXTRACT(YEAR FROM holiday_date) = ?",
        [numericYear]
      ).orWhereRaw(
        "EXTRACT(YEAR FROM replacement_date) = ?",
        [numericYear]
      );
    })
    .orderBy("holiday_date", "asc")
    .orderBy("id", "asc");

  const data = [];

  for (const group of groups) {
    data.push(await getSwapWithEmployees(knex, group));
  }

  return {
    success: true,
    message: "Workday swaps fetched successfully",
    data: {
      year: numericYear,
      workday_swaps: data,
    },
  };
}

// =====================================================
// CREATE WORKDAY SWAP
// =====================================================

async function createWorkdaySwap({
  adminId,
  holiday_date,
  replacement_date,
  user_ids,
  reason,
}) {
  const holidayDate = validateSwapDate(
    holiday_date,
    "holiday_date"
  );

  const replacementDate = validateSwapDate(
    replacement_date,
    "replacement_date"
  );

  const userIds = validateEmployeeIds(user_ids);
  const swapReason = validateReason(reason);

  if (holidayDate === replacementDate) {
    invalidSwap(
      "holiday_date and replacement_date must be different"
    );
  }

  return knex.transaction(async (trx) => {
    // --------------------------------------------
    // VALIDATE ADMIN
    // --------------------------------------------

    await validateAdmin(trx, adminId);

    // --------------------------------------------
    // CHECK MONTH LOCK
    // --------------------------------------------

    await checkMonthLocked(trx, holidayDate);
    await checkMonthLocked(trx, replacementDate);

    // --------------------------------------------
    // VALIDATE WEEKLY OFF DAYS
    // --------------------------------------------

    const weeklyOffDays = await getWeeklyOffDays(trx);

    if (weeklyOffDays.includes(getDayOfWeek(holidayDate))) {
      invalidSwap(
        "holiday_date must be a normally scheduled workday",
        "INVALID_HOLIDAY_DATE"
      );
    }

    if (!weeklyOffDays.includes(getDayOfWeek(replacementDate))) {
      invalidSwap(
        "replacement_date must be a configured weekly off day",
        "INVALID_REPLACEMENT_DATE"
      );
    }

    // --------------------------------------------
    // CHECK PUBLIC HOLIDAY CONFLICT
    // --------------------------------------------

    const conflictingHoliday = await trx("holidays")
      .whereIn("holiday_date", [
        holidayDate,
        replacementDate,
      ])
      .first("holiday_date");

    if (conflictingHoliday) {
      invalidSwap(
        "A workday swap cannot use a date already configured as a public holiday",
        "HOLIDAY_DATE_CONFLICT"
      );
    }

    // --------------------------------------------
    // VALIDATE ACTIVE EMPLOYEES
    // --------------------------------------------

    const employees = await trx("users")
      .select("id")
      .whereIn("id", userIds)
      .where({
        role: "EMPLOYEE",
        status: "ACTIVE",
      })
      .orderBy("id", "asc")
      .forUpdate();

    if (employees.length !== userIds.length) {
      invalidSwap(
        "Every user_id must belong to an active employee",
        "INVALID_EMPLOYEES"
      );
    }

    // --------------------------------------------
    // CHECK EXISTING SWAP CONFLICTS
    // --------------------------------------------

    const dates = [holidayDate, replacementDate];

    const overlap = await trx(
      "workday_swap_employees as employees"
    )
      .join(
        "workday_swap_groups as swaps",
        "swaps.id",
        "employees.group_id"
      )
      .whereIn("employees.user_id", userIds)
      .andWhere(function () {
        this.whereIn("swaps.holiday_date", dates)
          .orWhereIn("swaps.replacement_date", dates);
      })
      .first("employees.user_id");

    if (overlap) {
      invalidSwap(
        "One or more selected employees already have a swap involving these dates",
        "WORKDAY_SWAP_CONFLICT"
      );
    }

    // --------------------------------------------
    // INSERT WORKDAY SWAP GROUP
    // --------------------------------------------

    const [insertedGroup] = await trx("workday_swap_groups")
      .insert({
        holiday_date: holidayDate,
        replacement_date: replacementDate,
        reason: swapReason,
        created_by: adminId,
      })
      .returning(["id"]);

    // --------------------------------------------
    // FETCH GROUP WITH EXACT DATE STRINGS
    // --------------------------------------------

    const group = await trx("workday_swap_groups")
      .select(
        "id",
        trx.raw("holiday_date::text AS holiday_date"),
        trx.raw("replacement_date::text AS replacement_date"),
        "reason",
        "created_by",
        "created_at",
        "updated_at"
      )
      .where("id", insertedGroup.id)
      .first();

    // --------------------------------------------
    // INSERT SELECTED EMPLOYEES
    // --------------------------------------------

    await trx("workday_swap_employees").insert(
      userIds.map((userId) => ({
        group_id: group.id,
        user_id: userId,
      }))
    );

    // --------------------------------------------
    // RECOMPUTE ATTENDANCE
    // --------------------------------------------

    for (const userId of userIds) {
      await recomputeDay(userId, holidayDate, trx);
      await recomputeDay(userId, replacementDate, trx);
    }

    // --------------------------------------------
    // AUDIT LOG
    // --------------------------------------------

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,
        action: "WORKDAY_SWAP_CREATED",
        entity_type: "workday_swap_groups",
        entity_id: group.id,
        before: null,
        after: {
          ...formatGroupDates(group),
          user_ids: userIds,
        },
        reason: swapReason,
      })
      .returning(["id"]);

    await trx("notifications").insert(
      userIds.map((userId) => ({
        user_id: userId,
        actor_id: adminId,
        type: "WORKDAY_SWAP",
        title: "Workday swap assigned",
        message:
          `Your shutdown day is ${holidayDate}; you are scheduled to work on ${replacementDate}. ` +
          `Reason: ${swapReason}`,
        entity_type: "workday_swap_groups",
        entity_id: group.id,
        data: {
          workday_swap_id: group.id,
          holiday_date: holidayDate,
          replacement_date: replacementDate,
          reason: swapReason,
        },
      }))
    );

    // --------------------------------------------
    // RESPONSE
    // --------------------------------------------

    return {
      success: true,
      message: "Workday swap created successfully",
      data: {
        workday_swap: await getSwapWithEmployees(trx, group),
        audit_id: audit.id,
      },
    };
  });
}

// =====================================================
// DELETE WORKDAY SWAP
// =====================================================

async function deleteWorkdaySwap({ adminId, swapId }) {
  const numericId = Number(swapId);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    invalidSwap(
      "Invalid workday swap ID",
      "INVALID_WORKDAY_SWAP_ID"
    );
  }

  return knex.transaction(async (trx) => {
    // VALIDATE ADMIN


    await validateAdmin(trx, adminId);

    // GET WORKDAY SWAP
 
    const group = await trx("workday_swap_groups")
      .select(
        "id",
        knex.raw("holiday_date::text as holiday_date"),
        knex.raw("replacement_date::text as replacement_date"),
        "reason",
        "created_by",
        "created_at",
        "updated_at"
      )
      .where("id", numericId)
      .forUpdate()
      .first();

    if (!group) {
      invalidSwap(
        "Workday swap not found",
        "WORKDAY_SWAP_NOT_FOUND"
      );
    }

    const holidayDate = group.holiday_date;
    const replacementDate = group.replacement_date;

    // CHECK MONTH LOCK

    await checkMonthLocked(trx, holidayDate);
    await checkMonthLocked(trx, replacementDate);

    // GET ASSIGNED EMPLOYEES

    const employeeRows = await trx("workday_swap_employees")
      .select("user_id")
      .where("group_id", numericId);

    const userIds = employeeRows.map((row) => row.user_id);

    // LOCK EMPLOYEE RECORDS

    await trx("users")
      .whereIn("id", userIds)
      .orderBy("id", "asc")
      .forUpdate()
      .select("id");

    // SAVE BEFORE DATA

    const before = await getSwapWithEmployees(trx, group);


    // DELETE SWAP

    await trx("workday_swap_groups")
      .where("id", numericId)
      .del();


    // RECOMPUTE ATTENDANCE
  
    for (const userId of userIds) {
      await recomputeDay(userId, holidayDate, trx);
      await recomputeDay(userId, replacementDate, trx);
    }

    // AUDIT LOG

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,
        action: "WORKDAY_SWAP_DELETED",
        entity_type: "workday_swap_groups",
        entity_id: numericId,
        before,
        after: null,
        reason: `Workday swap deleted: ${group.reason}`,
      })
      .returning(["id"]);

    // RESPONSE

    return {
      success: true,
      message: "Workday swap deleted successfully",
      data: {
        workday_swap: before,
        audit_id: audit.id,
      },
    };
  });
}


module.exports = {
  getWorkdaySwaps,
  createWorkdaySwap,
  deleteWorkdaySwap,
};
