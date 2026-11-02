const knex = require("../config/database");
const { formatDateOnly } = require("../utils/dateHelpers");

// GET MY PERMISSION BALANCE

async function getMyPermissionBalance({ userId, month, year }) {
  // ----------------------------------------------------------
  // Current date
  // ----------------------------------------------------------

  const now = new Date();

  const currentYear = now.getUTCFullYear();

  const currentMonth = now.getUTCMonth() + 1;

  // ----------------------------------------------------------
  // Use current month/year if not supplied
  // ----------------------------------------------------------

  const selectedMonth = month !== undefined ? Number(month) : currentMonth;

  const selectedYear = year !== undefined ? Number(year) : currentYear;

  // ----------------------------------------------------------
  // Validate month
  // ----------------------------------------------------------

  if (
    !Number.isInteger(selectedMonth) ||
    selectedMonth < 1 ||
    selectedMonth > 12
  ) {
    const error = new Error("Month must be between 1 and 12");

    error.code = "INVALID_MONTH";

    throw error;
  }

  // ----------------------------------------------------------
  // Validate year
  // ----------------------------------------------------------

  if (
    !Number.isInteger(selectedYear) ||
    selectedYear < 2000 ||
    selectedYear > 2100
  ) {
    const error = new Error("Invalid year");

    error.code = "INVALID_YEAR";

    throw error;
  }

  // ----------------------------------------------------------
  // Month date range
  // ----------------------------------------------------------

  const startDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1))
    .toISOString()
    .slice(0, 10);

  const endDate = new Date(Date.UTC(selectedYear, selectedMonth, 1))
    .toISOString()
    .slice(0, 10);

  // ----------------------------------------------------------
  // Approved / used minutes
  // ----------------------------------------------------------

  const approvedResult = await knex("permission_requests")
    .sum({
      minutes: "minutes",
    })
    .where({
      user_id: userId,

      status: "APPROVED",
    })
    .where("perm_date", ">=", startDate)
    .where("perm_date", "<", endDate)
    .first();

  const usedMinutes = Number(approvedResult?.minutes ?? 0);

  // ----------------------------------------------------------
  // Pending minutes
  // ----------------------------------------------------------

  const pendingResult = await knex("permission_requests")
    .sum({
      minutes: "minutes",
    })
    .where({
      user_id: userId,

      status: "PENDING",
    })
    .where("perm_date", ">=", startDate)
    .where("perm_date", "<", endDate)
    .first();

  const pendingMinutes = Number(pendingResult?.minutes ?? 0);

  // ----------------------------------------------------------
  // Monthly permission limit
  // ----------------------------------------------------------

  const setting = await knex("settings")
    .where({
      key: "permission_monthly_min",
    })
    .first();

  let monthlyLimit = Number(setting?.value ?? 120);

  // JSONB numeric value should normally come
  // back as number. This also handles:
  // {"value":120} or string-like values safely.

  if (
    setting?.value &&
    typeof setting.value === "object" &&
    !Array.isArray(setting.value)
  ) {
    monthlyLimit = Number(setting.value.value ?? 120);
  }

  // Fallback
  if (!Number.isFinite(monthlyLimit)) {
    monthlyLimit = 120;
  }

  // ----------------------------------------------------------
  // Remaining
  // ----------------------------------------------------------

  const remainingMinutes = Math.max(
    0,
    monthlyLimit - usedMinutes - pendingMinutes,
  );

  return {
    success: true,

    data: {
      month: selectedMonth,

      year: selectedYear,

      monthly_limit: monthlyLimit,

      used_minutes: usedMinutes,

      pending_minutes: pendingMinutes,

      remaining_minutes: remainingMinutes,
    },
  };
}

// APPLY PERMISSION

async function applyMyPermission({
  userId,
  permDate,
  startTime,
  minutes,
  reason,
}) {
  // ----------------------------------------------------------
  // Validate date
  // ----------------------------------------------------------

  if (!permDate) {
    const error = new Error("perm_date is required");

    error.code = "INVALID_DATE";

    throw error;
  }

  const date = new Date(`${permDate}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    const error = new Error("Invalid permission date");

    error.code = "INVALID_DATE";

    throw error;
  }

  // Make sure input is actually YYYY-MM-DD
  const normalizedDate = formatDateOnly(permDate);

  if (normalizedDate !== String(permDate).slice(0, 10)) {
    const error = new Error("Invalid permission date");

    error.code = "INVALID_DATE";

    throw error;
  }

  // ----------------------------------------------------------
  // Validate start time
  // ----------------------------------------------------------

  if (!startTime || !/^\d{2}:\d{2}$/.test(String(startTime))) {
    const error = new Error("start_time must be in HH:MM format");

    error.code = "INVALID_TIME";

    throw error;
  }

  const [hour, minute] = String(startTime).split(":").map(Number);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    const error = new Error("Invalid start_time");

    error.code = "INVALID_TIME";

    throw error;
  }

  // ----------------------------------------------------------
  // Validate permission unit
  // ----------------------------------------------------------

  const requestedMinutes = Number(minutes);

  const allowedMinutes = [30, 60, 90, 120];

  if (
    !Number.isInteger(requestedMinutes) ||
    !allowedMinutes.includes(requestedMinutes)
  ) {
    const error = new Error("minutes must be 30, 60, 90 or 120");

    error.code = "INVALID_MINUTES";

    throw error;
  }

  // ----------------------------------------------------------
  // Validate reason
  // ----------------------------------------------------------

  if (!reason || !String(reason).trim()) {
    const error = new Error("Permission reason is required");

    error.code = "INVALID_REASON";

    throw error;
  }

  // ----------------------------------------------------------
  // Get monthly permission limit
  // ----------------------------------------------------------

  const setting = await knex("settings")
    .where({
      key: "permission_monthly_min",
    })
    .first();

  let monthlyLimit = Number(setting?.value ?? 120);

  if (
    setting?.value &&
    typeof setting.value === "object" &&
    !Array.isArray(setting.value)
  ) {
    monthlyLimit = Number(setting.value.value ?? 120);
  }

  if (!Number.isFinite(monthlyLimit)) {
    monthlyLimit = 120;
  }

  // ----------------------------------------------------------
  // Calculate month range
  // ----------------------------------------------------------

  const selectedDate = new Date(`${normalizedDate}T00:00:00Z`);

  const selectedYear = selectedDate.getUTCFullYear();

  const selectedMonth = selectedDate.getUTCMonth();

  const monthStart = new Date(Date.UTC(selectedYear, selectedMonth, 1))
    .toISOString()
    .slice(0, 10);

  const monthEnd = new Date(Date.UTC(selectedYear, selectedMonth + 1, 1))
    .toISOString()
    .slice(0, 10);

  // ----------------------------------------------------------
  // Approved minutes
  // ----------------------------------------------------------

  const approved = await knex("permission_requests")
    .sum({
      minutes: "minutes",
    })
    .where({
      user_id: userId,

      status: "APPROVED",
    })
    .where("perm_date", ">=", monthStart)
    .where("perm_date", "<", monthEnd)
    .first();

  const approvedMinutes = Number(approved?.minutes ?? 0);

  // ----------------------------------------------------------
  // Pending minutes
  // ----------------------------------------------------------

  const pending = await knex("permission_requests")
    .sum({
      minutes: "minutes",
    })
    .where({
      user_id: userId,

      status: "PENDING",
    })
    .where("perm_date", ">=", monthStart)
    .where("perm_date", "<", monthEnd)
    .first();

  const pendingMinutes = Number(pending?.minutes ?? 0);

  // ----------------------------------------------------------
  // Available minutes
  // ----------------------------------------------------------

  const availableMinutes = monthlyLimit - approvedMinutes - pendingMinutes;

  // ----------------------------------------------------------
  // Check monthly limit
  // ----------------------------------------------------------

  if (availableMinutes < requestedMinutes) {
    const error = new Error("Permission monthly limit exceeded");

    error.code = "PERMISSION_LIMIT_EXCEEDED";

    error.availableMinutes = Math.max(0, availableMinutes);

    error.requestedMinutes = requestedMinutes;

    throw error;
  }

  // ----------------------------------------------------------
  // Insert request
  // ----------------------------------------------------------

  const [permissionRequest] = await knex("permission_requests")
    .insert({
      user_id: userId,

      perm_date: normalizedDate,

      start_time: startTime,

      minutes: requestedMinutes,

      reason: String(reason).trim(),

      is_retroactive: normalizedDate < new Date().toISOString().slice(0, 10),

      status: "PENDING",
    })
    .returning([
      "id",
      "user_id",
      "perm_date",
      "start_time",
      "minutes",
      "reason",
      "is_retroactive",
      "status",
      "created_at",
    ]);

  return {
    success: true,

    message: "Permission request submitted successfully",

    data: {
      permission_request: permissionRequest,

      balance: {
        monthly_limit: monthlyLimit,

        approved_minutes: approvedMinutes,

        pending_minutes: pendingMinutes,

        remaining_after_reservation: availableMinutes - requestedMinutes,
      },
    },
  };
}

//  CANCEL PERMISSION

async function cancelMyPermission({ userId, permissionRequestId }) {
  // ----------------------------------------------------------
  // Validate ID
  // ----------------------------------------------------------

  if (!permissionRequestId || !Number.isInteger(Number(permissionRequestId))) {
    const error = new Error("Invalid permission request ID");

    error.code = "INVALID_PERMISSION_ID";

    throw error;
  }

  const id = Number(permissionRequestId);

  // ----------------------------------------------------------
  // Find request
  // ----------------------------------------------------------

  const permissionRequest = await knex("permission_requests")
    .where({
      id,
      user_id: userId,
    })
    .first();

  if (!permissionRequest) {
    const error = new Error("Permission request not found");

    error.code = "PERMISSION_NOT_FOUND";

    throw error;
  }

  // ----------------------------------------------------------
  // Only PENDING can be cancelled
  // ----------------------------------------------------------

  if (permissionRequest.status !== "PENDING") {
    const error = new Error(
      `Permission request cannot be cancelled because its current status is ${permissionRequest.status}`,
    );

    error.code = "PERMISSION_NOT_CANCELLABLE";

    error.status = permissionRequest.status;

    throw error;
  }

  // ----------------------------------------------------------
  // Cancel
  // ----------------------------------------------------------

  const [cancelledRequest] = await knex("permission_requests")
    .where({
      id,
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
      "perm_date",
      "start_time",
      "minutes",
      "reason",
      "is_retroactive",
      "status",
      "created_at",
      "updated_at",
    ]);

  return {
    success: true,

    message: "Permission request cancelled successfully",

    data: {
      permission_request: cancelledRequest,
    },
  };
}

//  ADMIN DECIDE PERMISSION

async function decideAdminPermission({
  adminId,
  permissionRequestId,
  action,
  note,
}) {
  // ----------------------------------------------------------
  // Validate ID
  // ----------------------------------------------------------

  if (!permissionRequestId || !Number.isInteger(Number(permissionRequestId))) {
    const error = new Error("Invalid permission request ID");

    error.code = "INVALID_PERMISSION_ID";

    throw error;
  }

  const id = Number(permissionRequestId);

  // ----------------------------------------------------------
  // Validate action
  // ----------------------------------------------------------

  const normalizedAction = String(action || "")
    .trim()
    .toUpperCase();

  if (!["APPROVE", "REJECT"].includes(normalizedAction)) {
    const error = new Error("Action must be APPROVE or REJECT");

    error.code = "INVALID_ACTION";

    throw error;
  }

  // ----------------------------------------------------------
  // Validate note
  // ----------------------------------------------------------

  if (!note || !String(note).trim()) {
    const error = new Error("Decision note is required");

    error.code = "INVALID_NOTE";

    throw error;
  }

  // ==========================================================
  // TRANSACTION
  // ==========================================================

  const result = await knex.transaction(async (trx) => {
    // ------------------------------------------------------
    // Lock permission request
    // ------------------------------------------------------

    const permissionRequest = await trx("permission_requests")
      .where({
        id,
      })
      .forUpdate()
      .first();

    if (!permissionRequest) {
      const error = new Error("Permission request not found");

      error.code = "PERMISSION_NOT_FOUND";

      throw error;
    }

    // ------------------------------------------------------
    // Only pending can be decided
    // ------------------------------------------------------

    if (permissionRequest.status !== "PENDING") {
      const error = new Error(
        `Permission request cannot be decided because its current status is ${permissionRequest.status}`,
      );

      error.code = "PERMISSION_NOT_DECIDABLE";

      error.status = permissionRequest.status;

      throw error;
    }

    // ======================================================
    // REJECT
    // ======================================================

    if (normalizedAction === "REJECT") {
      const [updatedRequest] = await trx("permission_requests")
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
          "perm_date",
          "start_time",
          "minutes",
          "reason",
          "is_retroactive",
          "status",
          "decided_by",
          "decided_at",
          "decision_note",
          "created_at",
          "updated_at",
        ]);

      // ----------------------------------------------------
      // Audit rejection
      // ----------------------------------------------------

      const [audit] = await trx("audit_log")
        .insert({
          actor_id: adminId,

          action: "PERMISSION_REJECTED",

          entity_type: "permission_request",

          entity_id: id,

          before: permissionRequest,

          after: updatedRequest,

          reason: String(note).trim(),
        })
        .returning([
          "id",
          "actor_id",
          "action",
          "entity_type",
          "entity_id",
          "before",
          "after",
          "reason",
          "created_at",
        ]);

      return {
        action: "REJECT",

        permissionRequest: updatedRequest,

        audit,
      };
    }

    // ======================================================
    // APPROVE
    // ======================================================

    const permissionDate = formatDateOnly(permissionRequest.perm_date);

    // ------------------------------------------------------
    // Get day summary
    // ------------------------------------------------------

    const daySummary = await trx("day_summaries")
      .where({
        user_id: permissionRequest.user_id,

        work_date: permissionDate,
      })
      .forUpdate()
      .first();

    // ------------------------------------------------------
    // Check payroll lock
    // ------------------------------------------------------

    if (daySummary?.is_locked) {
      const error = new Error(
        `Permission cannot be approved because ${permissionDate} is locked`,
      );

      error.code = "MONTH_LOCKED";

      error.lockedDate = permissionDate;

      throw error;
    }

    // ------------------------------------------------------
    // Update permission request
    // ------------------------------------------------------

    const [updatedRequest] = await trx("permission_requests")
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
        "perm_date",
        "start_time",
        "minutes",
        "reason",
        "is_retroactive",
        "status",
        "decided_by",
        "decided_at",
        "decision_note",
        "created_at",
        "updated_at",
      ]);

    // ------------------------------------------------------
    // Recompute permission for the day
    // ------------------------------------------------------

    const approvedPermissions = await trx("permission_requests")
      .select("start_time", "minutes")
      .where({
        user_id: permissionRequest.user_id,

        perm_date: permissionDate,

        status: "APPROVED",
      });

    // ------------------------------------------------------
    // Calculate total approved permission
    // ------------------------------------------------------

    let permissionMinutes = 0;

    for (const permission of approvedPermissions) {
      permissionMinutes += Number(permission.minutes);
    }

    // ------------------------------------------------------
    // Determine late status
    // ------------------------------------------------------
    //
    // We don't blindly set is_late=false.
    //
    // Permission can cover a late period.
    // ------------------------------------------------------

    let isLate = daySummary?.is_late ?? false;

    if (daySummary) {
      const shiftSetting = await trx("settings")
        .where({
          key: "shift",
        })
        .first();

      const graceSetting = await trx("settings")
        .where({
          key: "grace_min",
        })
        .first();

      let shiftStart = "09:00";

      if (shiftSetting?.value && typeof shiftSetting.value === "object") {
        shiftStart = shiftSetting.value.start ?? "09:00";
      }

      let graceMinutes = Number(graceSetting?.value ?? 10);

      if (graceSetting?.value && typeof graceSetting.value === "object") {
        graceMinutes = Number(graceSetting.value.value ?? 10);
      }

      if (daySummary.first_in) {
        const firstIn = new Date(daySummary.first_in);

        // Convert shift start into minutes
        const [shiftHour, shiftMinute] = String(shiftStart)
          .split(":")
          .map(Number);

        const shiftStartMinutes = shiftHour * 60 + shiftMinute;

        const inHour = firstIn.getUTCHours();

        const inMinute = firstIn.getUTCMinutes();

        const inMinutes = inHour * 60 + inMinute;

        const lateMinutes = inMinutes - shiftStartMinutes;

        // ------------------------------------------------
        // Permission covers the late period
        // ------------------------------------------------

        if (lateMinutes <= graceMinutes) {
          isLate = false;
        } else {
          let permissionCoverage = 0;

          for (const permission of approvedPermissions) {
            const [pHour, pMinute] = String(permission.start_time)
              .slice(0, 5)
              .split(":")
              .map(Number);

            const permissionStart = pHour * 60 + pMinute;

            const permissionEnd = permissionStart + Number(permission.minutes);

            // Late period starts at shift start
            // Permission must cover it.
            if (
              permissionStart <= shiftStartMinutes &&
              permissionEnd >= inMinutes
            ) {
              permissionCoverage = Number(permission.minutes);

              break;
            }
          }

          if (permissionCoverage > 0) {
            isLate = false;
          }
        }
      }
    }

    // ------------------------------------------------------
    // Determine status
    // ------------------------------------------------------

    let newStatus = daySummary?.status ?? "PRESENT";

    if (daySummary) {
      // If permission approval fixes the late
      // condition, keep the attendance status.
      if (isLate === false && daySummary.status === "INSUFFICIENT") {
        newStatus = "PRESENT";
      }
    }

    // ------------------------------------------------------
    // Update existing day summary
    // ------------------------------------------------------

    if (daySummary) {
      await trx("day_summaries")
        .where({
          id: daySummary.id,
        })
        .update({
          permission_min: permissionMinutes,

          is_late: isLate,

          status: newStatus,

          updated_at: trx.fn.now(),
        });
    } else {
      // ----------------------------------------------------
      // No summary exists.
      // Create one.
      // ----------------------------------------------------

      await trx("day_summaries").insert({
        user_id: permissionRequest.user_id,

        work_date: permissionDate,

        status: "PRESENT",

        work_min: 0,

        break_min: 0,

        permission_min: permissionMinutes,

        is_late: isLate,

        excess_break: false,

        needs_regularization: false,

        lop_value: 0,

        is_locked: false,
      });
    }

    // ------------------------------------------------------
    // Audit approval
    // ------------------------------------------------------

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,

        action: "PERMISSION_APPROVED",

        entity_type: "permission_request",

        entity_id: id,

        before: permissionRequest,

        after: updatedRequest,

        reason: String(note).trim(),
      })
      .returning([
        "id",
        "actor_id",
        "action",
        "entity_type",
        "entity_id",
        "before",
        "after",
        "reason",
        "created_at",
      ]);

    return {
      action: "APPROVE",

      permissionRequest: updatedRequest,

      day_summary: {
        work_date: permissionDate,

        permission_min: permissionMinutes,

        is_late: isLate,

        status: newStatus,
      },

      audit,
    };
  });

  // ----------------------------------------------------------
  // Notification
  // ----------------------------------------------------------
  //
  // FCM/email notification can be added here.
  // Do it AFTER the transaction succeeds.
  // ----------------------------------------------------------

  return {
    success: true,

    message:
      result.action === "APPROVE"
        ? "Permission request approved successfully"
        : "Permission request rejected successfully",

    data: result,
  };
}


// ADMIN DECIDE PERMISSION

async function getAdminPermissionRequests({
  status,
  month,
  year,
}) {

  const validStatuses = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
  ];

  if (
    status &&
    !validStatuses.includes(
      String(status).toUpperCase()
    )
  ) {
    const error = new Error(
      "Invalid permission request status"
    );

    error.code = "INVALID_STATUS";

    throw error;
  }

  if (month !== undefined) {
    const monthNumber = Number(month);

    if (
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {
      const error = new Error(
        "Month must be between 1 and 12"
      );

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

  const query = knex("permission_requests as pr")
    .join("users as u", "u.id", "pr.user_id")
    .select(
      "pr.id",
      "pr.user_id",
      "pr.perm_date",
      "pr.start_time",
      "pr.minutes",
      "pr.reason",
      "pr.is_retroactive",
      "pr.status",
      "pr.decided_by",
      "pr.decided_at",
      "pr.decision_note",
      "pr.created_at",
      "pr.updated_at",

      // Employee Details
      "u.emp_code",
      "u.name as employee_name",
      "u.email as employee_email",
      "u.phone as employee_phone",
      "u.designation"
    );

  if (status) {
    query.where(
      "pr.status",
      String(status).toUpperCase()
    );
  }

  if (month) {
    query.whereRaw(
      "EXTRACT(MONTH FROM pr.perm_date) = ?",
      [Number(month)]
    );
  }

  if (year) {
    query.whereRaw(
      "EXTRACT(YEAR FROM pr.perm_date) = ?",
      [Number(year)]
    );
  }

  query.orderBy(
    "pr.created_at",
    "desc"
  );

  const requests = await query;

  return {
    success: true,

    data: {
      requests,
    },

    count: requests.length,
  };
}

module.exports = {
  getMyPermissionBalance,
  applyMyPermission,
  cancelMyPermission,
  decideAdminPermission,
  getAdminPermissionRequests
};
