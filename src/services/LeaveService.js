const knex = require("../config/database");
const formatDateOnly = require("../utils/dateHelpers").formatDateOnly;

// GET EMPLOYEE LEAVE BALANCE

async function getMyLeaveBalance({ userId }) {
  // ----------------------------------
  // Current Balance
  // ----------------------------------

  const ledger = await knex("leave_ledger")
    .sum({
      balance: "delta",
    })
    .where({
      user_id: userId,
    })
    .first();

  const balance = Number(ledger?.balance ?? 0);

  // ----------------------------------
  // Current Month
  // ----------------------------------

  const now = new Date();

  const year = now.getUTCFullYear();

  const monthIndex = now.getUTCMonth();

  const startDate = new Date(Date.UTC(year, monthIndex, 1))
    .toISOString()
    .slice(0, 10);

  const endDate = new Date(Date.UTC(year, monthIndex + 1, 1))
    .toISOString()
    .slice(0, 10);

  // ----------------------------------
  // Leave consumed this month
  // ----------------------------------

  const consumed = await knex("leave_ledger")
    .sum({
      days: knex.raw("ABS(COALESCE(delta, 0))"),
    })
    .where({
      user_id: userId,
      type: "CONSUMED",
    })
    .where("entry_date", ">=", startDate)
    .where("entry_date", "<", endDate)
    .first();

  // ----------------------------------
  // Pending requests
  // ----------------------------------

  const pending = await knex("leave_requests")
    .sum({
      days: "days",
    })
    .where({
      user_id: userId,
      status: "PENDING",
    })
    .first();

  return {
    success: true,
    data: {
      available_balance: balance,

      consumed_this_month: Number(consumed?.days ?? 0),

      pending_days: Number(pending?.days ?? 0),
    },
  };
}

// LEAVE APPLY FOR EMPLOYEE

// async function applyMyLeave({ userId, fromDate, toDate, reason }) {
//   if (!fromDate || !toDate) {
//     const error = new Error("from_date and to_date are required");

//     error.code = "INVALID_DATE_RANGE";

//     throw error;
//   }

//   if (!reason || !String(reason).trim()) {
//     const error = new Error("Leave reason is required");

//     error.code = "INVALID_REASON";

//     throw error;
//   }

//   const from = new Date(`${fromDate}T00:00:00Z`);

//   const to = new Date(`${toDate}T00:00:00Z`);

//   if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
//     const error = new Error("Invalid from_date or to_date");

//     error.code = "INVALID_DATE_RANGE";

//     throw error;
//   }

//   if (from > to) {
//     const error = new Error("from_date must be before or equal to to_date");

//     error.code = "INVALID_DATE_RANGE";

//     throw error;
//   }

//   const settings = await knex("settings").whereIn("key", ["weekly_off_days"]);

//   const settingsMap = {};

//   for (const row of settings) {
//     settingsMap[row.key] = row.value;
//   }

//   // weekly_off_days is stored as:
//   // [0, 6]
//   //
//   // 0 = Sunday
//   // 6 = Saturday

//   const weeklyOffDays = Array.isArray(settingsMap.weekly_off_days)
//     ? settingsMap.weekly_off_days
//     : [0, 6];

//   const holidays = await knex("holidays")
//     .select("holiday_date")
//     .where("holiday_date", ">=", fromDate)
//     .where("holiday_date", "<=", toDate);

    
//   const holidaySet = new Set(
//     holidays.map((holiday) => String(holiday.holiday_date).slice(0, 10)),
//   );


//   let days = 0;

//   const current = new Date(from);

//   while (current <= to) {
//     const dateString = current.toISOString().slice(0, 10);

//     const dayOfWeek = current.getUTCDay();

//     const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);

//     const isHoliday = holidaySet.has(dateString);

//     if (!isWeeklyOff && !isHoliday) {
//       days += 1;
//     }

//     current.setUTCDate(current.getUTCDate() + 1);
//   }

//   if (days <= 0) {
//     const error = new Error("Selected dates contain no working days");

//     error.code = "NO_LEAVE_DAYS";

//     throw error;
//   }

//   const ledger = await knex("leave_ledger")
//     .sum({
//       balance: "delta",
//     })
//     .where({
//       user_id: userId,
//     })
//     .first();

//   const balance = Number(ledger?.balance ?? 0);

//   const pending = await knex("leave_requests")
//     .sum({
//       days: "days",
//     })
//     .where({
//       user_id: userId,
//       status: "PENDING",
//     })
//     .first();

//   const pendingDays = Number(pending?.days ?? 0);

//   const availableBalance = balance - pendingDays;

//   if (availableBalance < days) {
//     const error = new Error("Insufficient leave balance");

//     error.code = "INSUFFICIENT_BALANCE";

//     error.availableBalance = availableBalance;

//     error.requestedDays = days;

//     throw error;
//   }

//   const today = new Date().toISOString().slice(0, 10);

//   const isRetroactive = fromDate < today;

//   const [leaveRequest] = await knex("leave_requests")
//     .insert({
//       user_id: userId,
//       from_date: fromDate,
//       to_date: toDate,
//       days: days,
//       reason: String(reason).trim(),
//       is_retroactive: isRetroactive,
//       status: "PENDING",
//     })
//     .returning([
//       "id",
//       "user_id",
//       "from_date",
//       "to_date",
//       "days",
//       "reason",
//       "is_retroactive",
//       "status",
//       "created_at",
//     ]);

//   return {
//     success: true,
//     message: "Leave request submitted successfully",
//     data: {
//       leave_request: leaveRequest,

//       balance: {
//         current: balance,

//         pending_reserved: pendingDays,

//         available_after_reservation: availableBalance - days,
//       },
//     },
//   };
// }

// LEAVE APPLY FOR EMPLOYEE

async function applyMyLeave({
  userId,
  fromDate,
  toDate,
  reason
}) {
  // --------------------------------------------------
  // 1. Validate required fields
  // --------------------------------------------------

  if (!fromDate || !toDate) {
    const error = new Error(
      "from_date and to_date are required"
    );

    error.code = "INVALID_DATE_RANGE";

    throw error;
  }

  if (!reason || !String(reason).trim()) {
    const error = new Error(
      "Leave reason is required"
    );

    error.code = "INVALID_REASON";

    throw error;
  }

  // --------------------------------------------------
  // 2. Validate and normalize dates
  // --------------------------------------------------

  const normalizedFromDate = formatDateOnly(fromDate);
  const normalizedToDate = formatDateOnly(toDate);

  const from = new Date(
    `${normalizedFromDate}T00:00:00Z`
  );

  const to = new Date(
    `${normalizedToDate}T00:00:00Z`
  );

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime())
  ) {
    const error = new Error(
      "Invalid from_date or to_date"
    );

    error.code = "INVALID_DATE_RANGE";

    throw error;
  }

  if (from > to) {
    const error = new Error(
      "from_date must be before or equal to to_date"
    );

    error.code = "INVALID_DATE_RANGE";

    throw error;
  }

  // --------------------------------------------------
  // 3. Get weekly off configuration
  // --------------------------------------------------

  const settings = await knex("settings")
    .whereIn("key", ["weekly_off_days"]);

  const settingsMap = {};

  for (const row of settings) {
    settingsMap[row.key] = row.value;
  }

  /*
    weekly_off_days example:

    [0, 6]

    0 = Sunday
    6 = Saturday
  */

  let weeklyOffDays = settingsMap.weekly_off_days;

  // Handle JSON/JSONB values
  if (typeof weeklyOffDays === "string") {
    try {
      weeklyOffDays = JSON.parse(weeklyOffDays);
    } catch (error) {
      weeklyOffDays = null;
    }
  }

  if (!Array.isArray(weeklyOffDays)) {
    weeklyOffDays = [0, 6];
  }

  // Convert values to numbers
  weeklyOffDays = weeklyOffDays.map(Number);

  // --------------------------------------------------
  // 4. Get holidays between selected dates
  // --------------------------------------------------

  /*
    holiday_date is PostgreSQL DATE.

    We explicitly cast it to TEXT so Node receives:

    "2026-10-02"

    instead of a JavaScript Date object.
  */

  const holidays = await knex("holidays")
    .select(
      knex.raw(
        "holiday_date::text as holiday_date"
      ),
      "name"
    )
    .whereBetween(
      "holiday_date",
      [normalizedFromDate, normalizedToDate]
    );

  // --------------------------------------------------
  // 5. Create holiday lookup set
  // --------------------------------------------------

  const holidaySet = new Set(
    holidays.map(
      (holiday) => holiday.holiday_date
    )
  );

  // --------------------------------------------------
  // 6. Calculate actual leave days
  // --------------------------------------------------

  let days = 0;

  const excludedDates = [];

  const current = new Date(from);

  while (current <= to) {

    const dateString =
      current.toISOString().slice(0, 10);

    const dayOfWeek =
      current.getUTCDay();

    const isWeeklyOff =
      weeklyOffDays.includes(dayOfWeek);

    const holiday =
      holidays.find(
        (item) =>
          item.holiday_date === dateString
      );

    const isHoliday =
      holidaySet.has(dateString);

    // ----------------------------------------------
    // Weekly off
    // ----------------------------------------------

    if (isWeeklyOff) {

      excludedDates.push({
        date: dateString,
        type: "WEEKLY_OFF"
      });

    }

    // ----------------------------------------------
    // Holiday
    // ----------------------------------------------

    else if (isHoliday) {

      excludedDates.push({
        date: dateString,
        type: "HOLIDAY",
        name: holiday?.name || null
      });

    }

    // ----------------------------------------------
    // Working day
    // ----------------------------------------------

    else {

      days += 1;

    }

    // Move to next date
    current.setUTCDate(
      current.getUTCDate() + 1
    );
  }

  // --------------------------------------------------
  // 7. Make sure at least one working day exists
  // --------------------------------------------------

  if (days <= 0) {

    const error = new Error(
      "Selected dates contain no working days"
    );

    error.code = "NO_LEAVE_DAYS";

    error.excludedDates =
      excludedDates;

    throw error;
  }

  // --------------------------------------------------
  // 8. Get current leave balance
  // --------------------------------------------------

  const ledger = await knex("leave_ledger")
    .sum({
      balance: "delta"
    })
    .where({
      user_id: userId
    })
    .first();

  const balance =
    Number(ledger?.balance ?? 0);

  // --------------------------------------------------
  // 9. Get pending leave requests
  // --------------------------------------------------

  const pending = await knex("leave_requests")
    .sum({
      days: "days"
    })
    .where({
      user_id: userId,
      status: "PENDING"
    })
    .first();

  const pendingDays =
    Number(pending?.days ?? 0);

  // --------------------------------------------------
  // 10. Calculate available balance
  // --------------------------------------------------

  const availableBalance =
    balance - pendingDays;

  // --------------------------------------------------
  // 11. Check sufficient balance
  // --------------------------------------------------

  if (availableBalance < days) {

    const error = new Error(
      "Insufficient leave balance"
    );

    error.code =
      "INSUFFICIENT_BALANCE";

    error.availableBalance =
      availableBalance;

    error.requestedDays =
      days;

    throw error;
  }

  // --------------------------------------------------
  // 12. Check retroactive leave
  // --------------------------------------------------

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const isRetroactive =
    normalizedFromDate < today;

  // --------------------------------------------------
  // 13. Create leave request
  // --------------------------------------------------

  const [leaveRequest] =
    await knex("leave_requests")
      .insert({
        user_id: userId,

        from_date: normalizedFromDate,

        to_date: normalizedToDate,

        days: days,

        reason: String(reason).trim(),

        is_retroactive:
          isRetroactive,

        status: "PENDING"
      })
      .returning([
        "id",
        "user_id",
        "from_date",
        "to_date",
        "days",
        "reason",
        "is_retroactive",
        "status",
        "created_at"
      ]);

  // --------------------------------------------------
  // 14. Return response
  // --------------------------------------------------

  return {
    success: true,

    message:
      "Leave request submitted successfully",

    data: {

      leave_request: leaveRequest,

      balance: {

        current: balance,

        pending_reserved:
          pendingDays,

        available_after_reservation:
          availableBalance - days
      },

      leave_calculation: {

        requested_from:
          normalizedFromDate,

        requested_to:
          normalizedToDate,

        leave_days:
          days,

        excluded_dates:
          excludedDates
      }
    }
  };
}

// CANCEL LEAVE REQUEST FOR EMPLOYEE

async function cancelMyLeave({ userId, leaveRequestId }) {
  if (!leaveRequestId || !Number.isInteger(Number(leaveRequestId))) {
    const error = new Error("Invalid leave request ID");

    error.code = "INVALID_LEAVE_ID";

    throw error;
  }

  const id = Number(leaveRequestId);

  const leaveRequest = await knex("leave_requests")
    .where({
      id: id,
      user_id: userId,
    })
    .first();

  if (!leaveRequest) {
    const error = new Error("Leave request not found");

    error.code = "LEAVE_NOT_FOUND";

    throw error;
  }

  if (leaveRequest.status !== "PENDING") {
    const error = new Error(
      `Leave request cannot be cancelled because its current status is ${leaveRequest.status}`,
    );

    error.code = "LEAVE_NOT_CANCELLABLE";

    error.status = leaveRequest.status;

    throw error;
  }

  const [cancelledRequest] = await knex("leave_requests")
    .where({
      id: id,
      user_id: userId,
      status: "PENDING",
    })
    .update({
      status: "CANCELLED",
      updated_at: knex.fn.now(),
    })
    .returning([
      "id",
      "user_id",
      "from_date",
      "to_date",
      "days",
      "reason",
      "is_retroactive",
      "status",
      "created_at",
      "updated_at",
    ]);

  return {
    success: true,
    message: "Leave request cancelled successfully",
    data: {
      leave_request: cancelledRequest,
    },
  };
}

// GET ADMIN LEAVE REQUESTS

async function getAdminLeaveRequests({ status, month, year }) {
  const validStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

  if (status && !validStatuses.includes(String(status).toUpperCase())) {
    const error = new Error("Invalid leave request status");

    error.code = "INVALID_STATUS";

    throw error;
  }

  if (month !== undefined) {
    const monthNumber = Number(month);

    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      const error = new Error("Month must be between 1 and 12");

      error.code = "INVALID_MONTH";

      throw error;
    }
  }

  if (year !== undefined) {
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
  }

  const query = knex("leave_requests as lr")
    .join("users as u", "u.id", "lr.user_id")
    .select(
      "lr.id",
      "lr.user_id",
      "lr.from_date",
      "lr.to_date",
      "lr.days",
      "lr.reason",
      "lr.is_retroactive",
      "lr.status",
      "lr.decided_by",
      "lr.decided_at",
      "lr.decision_note",
      "lr.created_at",
      "lr.updated_at",

      // Employee information
      "u.emp_code",
      "u.name as employee_name",
      "u.email as employee_email",
      "u.phone as employee_phone",
      "u.designation",
    );

  if (status) {
    query.where("lr.status", String(status).toUpperCase());
  }

  if (month) {
    const monthNumber = Number(month);

    query.whereRaw("EXTRACT(MONTH FROM lr.from_date) = ?", [monthNumber]);
  }

  if (year) {
    const yearNumber = Number(year);

    query.whereRaw("EXTRACT(YEAR FROM lr.from_date) = ?", [yearNumber]);
  }

  query.orderBy("lr.created_at", "desc");

  const requests = await query;

  return {
    success: true,

    data: {
      requests,
    },

    count: requests.length,
  };
}

// ADMIN DECIDE LEAVE REQUEST

async function decideAdminLeave({ adminId, leaveRequestId, action, note }) {
  // ----------------------------------
  // Validate leave request ID
  // ----------------------------------

  if (!leaveRequestId || !Number.isInteger(Number(leaveRequestId))) {
    const error = new Error("Invalid leave request ID");

    error.code = "INVALID_LEAVE_ID";

    throw error;
  }

  const id = Number(leaveRequestId);

  // ----------------------------------
  // Validate action
  // ----------------------------------

  const normalizedAction = String(action || "")
    .trim()
    .toUpperCase();

  if (!["APPROVE", "REJECT"].includes(normalizedAction)) {
    const error = new Error("Action must be APPROVE or REJECT");

    error.code = "INVALID_ACTION";

    throw error;
  }

  // ----------------------------------
  // Validate note
  // ----------------------------------

  if (!note || !String(note).trim()) {
    const error = new Error("Decision note is required");

    error.code = "INVALID_NOTE";

    throw error;
  }

  // ==========================================================
  // TRANSACTION
  // ==========================================================

  const result = await knex.transaction(async (trx) => {
    // ----------------------------------
    // Get leave request
    // Lock row so two admins cannot
    // decide it simultaneously
    // ----------------------------------

    const leaveRequest = await trx("leave_requests")
      .where({
        id,
      })
      .forUpdate()
      .first();

    if (!leaveRequest) {
      const error = new Error("Leave request not found");

      error.code = "LEAVE_NOT_FOUND";

      throw error;
    }

    // ----------------------------------
    // Only PENDING can be decided
    // ----------------------------------

    if (leaveRequest.status !== "PENDING") {
      const error = new Error(
        `Leave request cannot be decided because its current status is ${leaveRequest.status}`,
      );

      error.code = "LEAVE_NOT_DECIDABLE";

      error.status = leaveRequest.status;

      throw error;
    }

    // ----------------------------------
    // Normalize PostgreSQL dates
    // ----------------------------------

    const fromDate = formatDateOnly(leaveRequest.from_date);

    const toDate = formatDateOnly(leaveRequest.to_date);

    // ======================================================
    // APPROVE
    // ======================================================

    if (normalizedAction === "APPROVE") {
      // ----------------------------------
      // Current ledger balance
      // ----------------------------------

      const ledger = await trx("leave_ledger")
        .sum({
          balance: "delta",
        })
        .where({
          user_id: leaveRequest.user_id,
        })
        .first();

      const balance = Number(ledger?.balance ?? 0);

      // ----------------------------------
      // Other pending requests
      //
      // Current request is excluded because
      // this request is being decided now.
      // ----------------------------------

      const pending = await trx("leave_requests")
        .sum({
          days: "days",
        })
        .where({
          user_id: leaveRequest.user_id,

          status: "PENDING",
        })
        .whereNot("id", id)
        .first();

      const otherPendingDays = Number(pending?.days ?? 0);

      const availableBalance = balance - otherPendingDays;

      const requestedDays = Number(leaveRequest.days);

      // ----------------------------------
      // Re-check balance
      // ----------------------------------

      if (availableBalance < requestedDays) {
        const error = new Error("Insufficient leave balance");

        error.code = "INSUFFICIENT_BALANCE";

        error.availableBalance = availableBalance;

        error.requestedDays = requestedDays;

        throw error;
      }

      // ----------------------------------
      // Get holidays
      // ----------------------------------

      const holidays = await trx("holidays")
        .select("holiday_date")
        .where("holiday_date", ">=", fromDate)
        .where("holiday_date", "<=", toDate);

      const holidaySet = new Set(
        holidays.map((holiday) => formatDateOnly(holiday.holiday_date)),
      );

      // ----------------------------------
      // Weekly-off settings
      // ----------------------------------

      const weeklyOffSetting = await trx("settings")
        .where({
          key: "weekly_off_days",
        })
        .first();

      const weeklyOffDays = Array.isArray(weeklyOffSetting?.value)
        ? weeklyOffSetting.value
        : [0, 6];

      // ----------------------------------
      // Prepare date range
      // ----------------------------------

      const from = new Date(`${fromDate}T00:00:00Z`);

      const to = new Date(`${toDate}T00:00:00Z`);

      // ----------------------------------
      // Check every affected working day
      // for payroll lock
      // ----------------------------------

      const checkDate = new Date(`${fromDate}T00:00:00Z`);

      while (checkDate <= to) {
        const dateString = checkDate.toISOString().slice(0, 10);

        const dayOfWeek = checkDate.getUTCDay();

        const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);

        const isHoliday = holidaySet.has(dateString);

        if (!isWeeklyOff && !isHoliday) {
          const summary = await trx("day_summaries")
            .where({
              user_id: leaveRequest.user_id,

              work_date: dateString,
            })
            .forUpdate()
            .first();

          if (summary?.is_locked) {
            const error = new Error(
              `Leave cannot be approved because ${dateString} is locked`,
            );

            error.code = "MONTH_LOCKED";

            error.lockedDate = dateString;

            throw error;
          }
        }

        checkDate.setUTCDate(checkDate.getUTCDate() + 1);
      }

      // ----------------------------------
      // Update leave request
      // ----------------------------------

      const [updatedRequest] = await trx("leave_requests")
        .where({
          id,
        })
        .update({
          status: "APPROVED",

          decided_by: adminId,

          decided_at: trx.fn.now(),

          decision_note: String(note).trim(),

          updated_at: trx.fn.now(),
        })
        .returning([
          "id",
          "user_id",
          "from_date",
          "to_date",
          "days",
          "reason",
          "is_retroactive",
          "status",
          "decided_by",
          "decided_at",
          "decision_note",
          "created_at",
          "updated_at",
        ]);

      // ----------------------------------
      // Consume leave
      // ----------------------------------

      const [ledgerEntry] = await trx("leave_ledger")
        .insert({
          user_id: leaveRequest.user_id,

          entry_date: new Date().toISOString().slice(0, 10),

          delta: -requestedDays,

          type: "CONSUMED",

          leave_request_id: id,

          note: `Leave consumed for request #${id}`,
        })
        .returning([
          "id",
          "user_id",
          "entry_date",
          "delta",
          "type",
          "leave_request_id",
          "note",
          "created_at",
        ]);

      // ----------------------------------
      // Rewrite day summaries
      // ----------------------------------

      // 
      // ----------------------------------
// Rewrite day summaries
// ----------------------------------

const currentDay = new Date(`${fromDate}T00:00:00Z`);

while (currentDay <= to) {
  const dateString = currentDay.toISOString().slice(0, 10);

  const dayOfWeek = currentDay.getUTCDay();

  const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);

  const isHoliday = holidaySet.has(dateString);

  // Only working days become LEAVE
  if (!isWeeklyOff && !isHoliday) {
    const summary = await trx("day_summaries")
      .where({
        user_id: leaveRequest.user_id,
        work_date: dateString,
      })
      .forUpdate()
      .first();

    if (summary) {
      // Existing summary → change to LEAVE
      await trx("day_summaries")
        .where({
          id: summary.id,
        })
        .update({
          status: "LEAVE",
          first_in: null,
          last_out: null,
          work_min: 0,
          break_min: 0,
          permission_min: 0,
          is_late: false,
          excess_break: false,
          needs_regularization: false,
          lop_value: 0,
          updated_at: trx.fn.now(),
        });
    } else {
      // No summary → create LEAVE summary
      await trx("day_summaries").insert({
        user_id: leaveRequest.user_id,
        work_date: dateString,
        status: "LEAVE",
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
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }
  }

  currentDay.setUTCDate(currentDay.getUTCDate() + 1);
}

      // ----------------------------------
      // Audit
      // ----------------------------------

      const [audit] = await trx("audit_log")
        .insert({
          actor_id: adminId,

          action: "LEAVE_APPROVED",

          entity_type: "leave_request",

          entity_id: id,

          before: leaveRequest,

          after: updatedRequest,

          reason: String(note).trim(),
        })
        .returning([
          "id",
          "actor_id",
          "action",
          "entity_type",
          "entity_id",
          "reason",
          "created_at",
        ]);

      return {
        action: "APPROVE",

        leaveRequest: updatedRequest,

        ledgerEntry: ledgerEntry,

        audit: audit,
      };
    }

    // ======================================================
    // REJECT
    // ======================================================

    const [updatedRequest] = await trx("leave_requests")
      .where({
        id,
      })
      .update({
        status: "REJECTED",

        decided_by: adminId,

        decided_at: trx.fn.now(),

        decision_note: String(note).trim(),

        updated_at: trx.fn.now(),
      })
      .returning([
        "id",
        "user_id",
        "from_date",
        "to_date",
        "days",
        "reason",
        "is_retroactive",
        "status",
        "decided_by",
        "decided_at",
        "decision_note",
        "created_at",
        "updated_at",
      ]);

    // ----------------------------------
    // Audit rejection
    // ----------------------------------

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,

        action: "LEAVE_REJECTED",

        entity_type: "leave_request",

        entity_id: id,

        before: leaveRequest,

        after: updatedRequest,

        reason: String(note).trim(),
      })
      .returning([
        "id",
        "actor_id",
        "action",
        "entity_type",
        "entity_id",
        "reason",
        "created_at",
      ]);

    return {
      action: "REJECT",

      leaveRequest: updatedRequest,

      audit: audit,
    };
  });

  // ==========================================================
  // NOTIFICATION
  // ==========================================================
  //
  // Add FCM/email notification here later.
  //
  // Important:
  // Notification happens AFTER the transaction succeeds.
  // A notification failure should not roll back the leave
  // approval/rejection.
  // ==========================================================

  return {
    success: true,

    message:
      result.action === "APPROVE"
        ? "Leave request approved successfully"
        : "Leave request rejected successfully",

    data: result,
  };
}

module.exports = {
  getMyLeaveBalance,
  applyMyLeave,
  cancelMyLeave,
  getAdminLeaveRequests,
  decideAdminLeave,
};
