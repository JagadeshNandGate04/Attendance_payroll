const knex = require("../config/database");

const { formatDateOnly } = require("../utils/dateHelpers");
const { recomputeDay } = require("../services/attendanceService");

// =====================================================
// NOTIFICATION HELPERS
// =====================================================

// NOTIFY ALL ACTIVE ADMINS

async function notifyAdmins(trx, {
  actorId,
  type,
  title,
  message,
  entityId,
  data = {},
}) {
  const admins = await trx("users")
    .select("id")
    .whereRaw("UPPER(role) = ?", ["ADMIN"])
    .whereRaw("UPPER(status) = ?", ["ACTIVE"]);

  if (!admins.length) return;

  await trx("notifications").insert(
    admins.map((admin) => ({
      user_id: admin.id,
      actor_id: actorId,
      type,
      title,
      message,
      entity_type: "regularization_request",
      entity_id: entityId,
      data,
    }))
  );
}

// NOTIFY ONE EMPLOYEE

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
    entity_type: "regularization_request",
    entity_id: entityId,
    data,
  });
}

// =====================================================
// APPLY REGULARIZATION
// =====================================================

async function applyMyRegularization({
  userId,
  workDate,
  type,
  claimedIn,
  claimedOut,
  reason,
}) {

  // VALIDATE WORK DATE

  if (!workDate) {
    const error = new Error("work_date is required");
    error.code = "INVALID_DATE";
    throw error;
  }

  let normalizedDate;

  try {
    normalizedDate = formatDateOnly(workDate);
  } catch (error) {
    const dateError = new Error("Invalid work_date");
    dateError.code = "INVALID_DATE";
    throw dateError;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workDate))) {
    const error = new Error("work_date must be in YYYY-MM-DD format");
    error.code = "INVALID_DATE";
    throw error;
  }

  // VALIDATE TYPE

  const normalizedType = String(type || "")
    .trim()
    .toUpperCase();

  const validTypes = ["MISSED_IN", "MISSED_OUT", "BOTH"];

  if (!validTypes.includes(normalizedType)) {
    const error = new Error(
      "type must be MISSED_IN, MISSED_OUT or BOTH"
    );
    error.code = "INVALID_TYPE";
    throw error;
  }

  // VALIDATE REASON

  if (!reason || !String(reason).trim()) {
    const error = new Error("Regularization reason is required");
    error.code = "INVALID_REASON";
    throw error;
  }

  // CLAIMED IN REQUIRED?

  if (
    (normalizedType === "MISSED_IN" || normalizedType === "BOTH") &&
    !claimedIn
  ) {
    const error = new Error(
      "claimed_in is required for this regularization type"
    );
    error.code = "MISSING_CLAIMED_IN";
    throw error;
  }

  // CLAIMED OUT REQUIRED?

  if (
    (normalizedType === "MISSED_OUT" || normalizedType === "BOTH") &&
    !claimedOut
  ) {
    const error = new Error(
      "claimed_out is required for this regularization type"
    );
    error.code = "MISSING_CLAIMED_OUT";
    throw error;
  }

  // PARSE CLAIMED TIMES

  let claimedInDate = null;
  let claimedOutDate = null;

  if (claimedIn) {
    claimedInDate = new Date(claimedIn);

    if (Number.isNaN(claimedInDate.getTime())) {
      const error = new Error("Invalid claimed_in timestamp");
      error.code = "INVALID_CLAIMED_IN";
      throw error;
    }
  }

  if (claimedOut) {
    claimedOutDate = new Date(claimedOut);

    if (Number.isNaN(claimedOutDate.getTime())) {
      const error = new Error("Invalid claimed_out timestamp");
      error.code = "INVALID_CLAIMED_OUT";
      throw error;
    }
  }

  // CLAIMED IN MUST BE BEFORE CLAIMED OUT

  if (
    claimedInDate &&
    claimedOutDate &&
    claimedInDate >= claimedOutDate
  ) {
    const error = new Error("claimed_in must be before claimed_out");
    error.code = "INVALID_TIME_ORDER";
    throw error;
  }

  // CHECK EXISTING RAW PUNCHES

  const rawPunches = await knex("raw_punches as rp")
    .join("users as u", "u.emp_code", "rp.emp_code")
    .select(
      "rp.id",
      "rp.punched_at",
      "rp.direction",
      "rp.verify_mode"
    )
    .where("u.id", userId)
    .whereRaw("DATE(rp.punched_at AT TIME ZONE ?) = ?", [
      "Asia/Kolkata",
      normalizedDate,
    ])
    .orderBy("rp.punched_at", "asc");

  // CHECK CORRECTION PUNCHES

  const correctionPunches = await knex("correction_punches")
    .select("id", "punched_at", "direction", "source")
    .where({
      user_id: userId,
      is_voided: false,
    })
    .whereRaw("DATE(punched_at AT TIME ZONE ?) = ?", [
      "Asia/Kolkata",
      normalizedDate,
    ])
    .orderBy("punched_at", "asc");

  // COMBINE PUNCHES

  const punches = [
    ...rawPunches.map((punch) => ({
      id: punch.id,
      punched_at: new Date(punch.punched_at),
      direction: punch.direction,
      source: "RAW",
    })),

    ...correctionPunches.map((punch) => ({
      id: punch.id,
      punched_at: new Date(punch.punched_at),
      direction: punch.direction,
      source: "CORRECTION",
    })),
  ].sort((a, b) => a.punched_at - b.punched_at);

  // CHECK EXISTING REQUEST

  const existingRequest = await knex("regularization_requests")
    .where({
      user_id: userId,
      work_date: normalizedDate,
    })
    .whereIn("status", ["PENDING", "APPROVED"])
    .first();

  if (existingRequest) {
    const error = new Error(
      "A pending or approved regularization already exists for this date"
    );
    error.code = "REGULARIZATION_EXISTS";
    throw error;
  }

  // FIND EXISTING IN / OUT

  const firstIn = punches.find(
    (punch) => punch.direction === "IN"
  );

  const firstOut = punches.find(
    (punch) => punch.direction === "OUT"
  );

  const lastOut = [...punches]
    .reverse()
    .find((punch) => punch.direction === "OUT");

  // MISSED IN VALIDATION

  if (
    normalizedType === "MISSED_IN" ||
    normalizedType === "BOTH"
  ) {
    if (firstOut && claimedInDate >= firstOut.punched_at) {
      const error = new Error(
        "claimed_in must be before the first OUT punch"
      );
      error.code = "INVALID_TIME_ORDER";
      throw error;
    }
  }

  // MISSED OUT VALIDATION

  if (
    normalizedType === "MISSED_OUT" ||
    normalizedType === "BOTH"
  ) {
    if (firstIn && claimedOutDate <= firstIn.punched_at) {
      const error = new Error(
        "claimed_out must be after the first IN punch"
      );
      error.code = "INVALID_TIME_ORDER";
      throw error;
    }

    if (lastOut && claimedOutDate <= lastOut.punched_at) {
      const error = new Error(
        "claimed_out must be after the existing OUT punch"
      );
      error.code = "INVALID_TIME_ORDER";
      throw error;
    }
  }

  // CHECK MISSED IN

  if (normalizedType === "MISSED_IN" && firstIn) {
    const error = new Error(
      "An IN punch already exists for this date"
    );
    error.code = "INVALID_TIME_ORDER";
    throw error;
  }

  // CHECK MISSED OUT

  if (normalizedType === "MISSED_OUT" && lastOut) {
    const error = new Error(
      "An OUT punch already exists for this date"
    );
    error.code = "INVALID_TIME_ORDER";
    throw error;
  }

  // BOTH VALIDATION

  if (normalizedType === "BOTH") {
    if (firstIn || firstOut) {
      const error = new Error(
        "Existing punches prevent a BOTH regularization request"
      );
      error.code = "INVALID_TIME_ORDER";
      throw error;
    }
  }

  // CHECK DAY LOCK

  const daySummary = await knex("day_summaries")
    .where({
      user_id: userId,
      work_date: normalizedDate,
    })
    .first();

  if (daySummary?.is_locked) {
    const error = new Error(
      `Regularization cannot be applied because ${normalizedDate} is locked`
    );
    error.code = "MONTH_LOCKED";
    error.lockedDate = normalizedDate;
    throw error;
  }

  // =====================================================
  // INSERT REQUEST + NOTIFY ADMINS
  // =====================================================

  return knex.transaction(async (trx) => {

    // GET EMPLOYEE

    const employee = await trx("users")
      .select("id", "name", "emp_code")
      .where({ id: userId })
      .first();

    if (!employee) {
      throw new Error("Employee not found");
    }

    // INSERT REQUEST

    const [regularizationRequest] = await trx(
      "regularization_requests"
    )
      .insert({
        user_id: userId,
        work_date: normalizedDate,
        type: normalizedType,
        claimed_in: claimedInDate,
        claimed_out: claimedOutDate,
        reason: String(reason).trim(),
        status: "PENDING",
      })
      .returning([
        "id",
        "user_id",
        "work_date",
        "type",
        "claimed_in",
        "claimed_out",
        "reason",
        "status",
        "created_at",
      ]);

    // NOTIFY ADMINS

    await notifyAdmins(trx, {
      actorId: userId,

      type: "REGULARIZATION_REQUEST",

      title: "New Attendance Regularization Request",

      message: `${employee.name} (${employee.emp_code}) submitted a ${normalizedType} regularization request for ${normalizedDate}.`,

      entityId: regularizationRequest.id,

      data: {
        employee_id: employee.id,
        employee_name: employee.name,
        emp_code: employee.emp_code,
        work_date: normalizedDate,
        type: normalizedType,
        claimed_in: claimedInDate,
        claimed_out: claimedOutDate,
        reason: String(reason).trim(),
      },
    });

    // RESPONSE

    return {
      success: true,

      message: "Regularization request submitted successfully",

      data: {
        regularization_request: regularizationRequest,
      },
    };
  });
}

// =====================================================
// GET MY REGULARIZATION REQUESTS
// =====================================================

async function getMyRegularizations({ userId, month, year }) {

  // VALIDATE MONTH

  if (month !== undefined) {
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
  }

  // VALIDATE YEAR

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

  // BUILD QUERY

  const query = knex("regularization_requests")
    .select(
      "id",
      "user_id",
      "work_date",
      "type",
      "claimed_in",
      "claimed_out",
      "reason",
      "status",
      "decided_by",
      "decided_at",
      "decision_note",
      "created_at",
      "updated_at"
    )
    .where("user_id", userId);

  // MONTH FILTER

  if (month !== undefined) {
    const monthNumber = Number(month);

    query.whereRaw(
      "EXTRACT(MONTH FROM work_date) = ?",
      [monthNumber]
    );
  }

  // YEAR FILTER

  if (year !== undefined) {
    const yearNumber = Number(year);

    query.whereRaw(
      "EXTRACT(YEAR FROM work_date) = ?",
      [yearNumber]
    );
  }

  query.orderBy("work_date", "desc");
  query.orderBy("created_at", "desc");

  const requests = await query;

  return {
    success: true,

    data: {
      requests,
    },

    count: requests.length,
  };
}

// =====================================================
// ADMIN - GET REGULARIZATION REQUESTS
// =====================================================

async function getAdminRegularizationRequests({ status }) {

  // VALIDATE STATUS

  const validStatuses = [
    "PENDING",
    "APPROVED",
    "REJECTED",
  ];

  if (
    status &&
    !validStatuses.includes(String(status).toUpperCase())
  ) {
    const error = new Error(
      "Invalid regularization request status"
    );
    error.code = "INVALID_STATUS";
    throw error;
  }

  // BUILD QUERY

  const query = knex("regularization_requests as rr")
    .join("users as u", "u.id", "rr.user_id")
    .leftJoin("day_summaries as ds", function () {
      this.on("ds.user_id", "=", "rr.user_id")
        .andOn("ds.work_date", "=", "rr.work_date");
    })
    .select(
      "rr.id",
      "rr.user_id",
      "rr.work_date",
      "rr.type",
      "rr.claimed_in",
      "rr.claimed_out",
      "rr.reason",
      "rr.status",
      "rr.decided_by",
      "rr.decided_at",
      "rr.decision_note",
      "rr.created_at",
      "rr.updated_at",

      "u.emp_code",
      "u.name as employee_name",
      "u.email as employee_email",
      "u.phone as employee_phone",
      "u.designation",

      "ds.status as day_status",
      "ds.first_in",
      "ds.last_out",
      "ds.work_min",
      "ds.break_min",
      "ds.permission_min",
      "ds.is_late",
      "ds.excess_break",
      "ds.needs_regularization",
      "ds.lop_value",
      "ds.is_locked"
    );

  if (status) {
    query.where(
      "rr.status",
      String(status).toUpperCase()
    );
  }

  query.orderBy("rr.created_at", "asc");

  const requests = await query;

  // FETCH PUNCH CONTEXT

  const result = [];

  for (const request of requests) {

    // RAW PUNCHES

    const rawPunches = await knex("raw_punches as rp")
      .join("users as u2", "u2.emp_code", "rp.emp_code")
      .select(
        "rp.id",
        "rp.punched_at",
        "rp.direction",
        "rp.verify_mode"
      )
      .where("u2.id", request.user_id)
      .whereRaw(
        "DATE(rp.punched_at AT TIME ZONE ?) = ?",
        ["Asia/Kolkata", request.work_date]
      )
      .orderBy("rp.punched_at", "asc");

    // CORRECTION PUNCHES

    const correctionPunches = await knex("correction_punches")
      .select(
        "id",
        "punched_at",
        "direction",
        "source",
        "regularization_id",
        "is_voided"
      )
      .where("user_id", request.user_id)
      .where("is_voided", false)
      .whereRaw(
        "DATE(punched_at AT TIME ZONE ?) = ?",
        ["Asia/Kolkata", request.work_date]
      )
      .orderBy("punched_at", "asc");

    // COMBINE PUNCHES

    const punches = [
      ...rawPunches.map((punch) => ({
        id: punch.id,
        punched_at: punch.punched_at,
        direction: punch.direction,
        verify_mode: punch.verify_mode,
        source: "RAW",
      })),

      ...correctionPunches.map((punch) => ({
        id: punch.id,
        punched_at: punch.punched_at,
        direction: punch.direction,
        source: punch.source,
      })),
    ].sort(
      (a, b) =>
        new Date(a.punched_at) - new Date(b.punched_at)
    );

    result.push({

      // REQUEST

      id: request.id,
      work_date: request.work_date,
      type: request.type,
      claimed_in: request.claimed_in,
      claimed_out: request.claimed_out,
      reason: request.reason,
      status: request.status,
      created_at: request.created_at,
      decided_at: request.decided_at,
      decision_note: request.decision_note,

      // EMPLOYEE

      employee: {
        id: request.user_id,
        emp_code: request.emp_code,
        name: request.employee_name,
        email: request.employee_email,
        phone: request.employee_phone,
        designation: request.designation,
      },

      // DAY ATTENDANCE CONTEXT

      day_context: {
        status: request.day_status,
        first_in: request.first_in,
        last_out: request.last_out,
        work_min: request.work_min,
        break_min: request.break_min,
        permission_min: request.permission_min,
        is_late: request.is_late,
        excess_break: request.excess_break,
        needs_regularization: request.needs_regularization,
        lop_value: request.lop_value,
        is_locked: request.is_locked,
      },

      // PUNCH CONTEXT

      punches,
    });
  }

  return {
    success: true,

    data: {
      requests: result,
    },

    count: result.length,
  };
}

// =====================================================
// ADMIN - APPROVE / REJECT REGULARIZATION
// =====================================================

async function decideAdminRegularization({
  adminId,
  regularizationRequestId,
  action,
  note,
}) {

  // VALIDATE ID

  if (
    !regularizationRequestId ||
    !Number.isInteger(Number(regularizationRequestId)) ||
    Number(regularizationRequestId) <= 0
  ) {
    const error = new Error(
      "Invalid regularization request ID"
    );
    error.code = "INVALID_REGULARIZATION_ID";
    throw error;
  }

  const requestId = Number(regularizationRequestId);

  // VALIDATE ACTION

  const normalizedAction = String(action || "")
    .trim()
    .toUpperCase();

  if (!["APPROVE", "REJECT"].includes(normalizedAction)) {
    const error = new Error(
      "action must be APPROVE or REJECT"
    );
    error.code = "INVALID_ACTION";
    throw error;
  }

  // VALIDATE NOTE

  if (!note || !String(note).trim()) {
    const error = new Error("Decision note is required");
    error.code = "INVALID_NOTE";
    throw error;
  }

  // GET REQUEST

  const regularizationRequest =
    await knex("regularization_requests")
      .where({ id: requestId })
      .first();

  if (!regularizationRequest) {
    const error = new Error(
      "Regularization request not found"
    );
    error.code = "REGULARIZATION_NOT_FOUND";
    throw error;
  }

  // REQUEST MUST BE PENDING

  if (regularizationRequest.status !== "PENDING") {
    const error = new Error(
      `Regularization request cannot be decided because its current status is ${regularizationRequest.status}`
    );
    error.code = "REGULARIZATION_NOT_DECIDABLE";
    error.status = regularizationRequest.status;
    throw error;
  }

  // APPROVAL / REJECTION TRANSACTION

  return knex.transaction(async (trx) => {

    // LOCK REQUEST

    const request = await trx("regularization_requests")
      .where({ id: requestId })
      .forUpdate()
      .first();

    if (!request || request.status !== "PENDING") {
      const error = new Error(
        "Regularization request is no longer pending"
      );
      error.code = "REGULARIZATION_NOT_DECIDABLE";
      error.status = request?.status;
      throw error;
    }

    // GET DAY SUMMARY

    const daySummary = await trx("day_summaries")
      .where({
        user_id: request.user_id,
        work_date: request.work_date,
      })
      .forUpdate()
      .first();

    // CHECK LOCK

    if (daySummary?.is_locked) {
      const error = new Error(
        `Regularization cannot be decided because ${request.work_date} is locked`
      );
      error.code = "MONTH_LOCKED";
      error.lockedDate = request.work_date;
      throw error;
    }

    // =================================================
    // REJECT
    // =================================================

    if (normalizedAction === "REJECT") {

      const [rejectedRequest] = await trx(
        "regularization_requests"
      )
        .where({
          id: request.id,
          status: "PENDING",
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
          "work_date",
          "type",
          "claimed_in",
          "claimed_out",
          "reason",
          "status",
          "decided_by",
          "decided_at",
          "decision_note",
          "created_at",
          "updated_at",
        ]);

      // AUDIT

      await trx("audit_log").insert({
        actor_id: adminId,
        action: "REGULARIZATION_REJECTED",
        entity_type: "regularization_requests",
        entity_id: request.id,

        before: JSON.stringify({
          status: "PENDING",
        }),

        after: JSON.stringify({
          status: "REJECTED",
          decided_by: adminId,
          decision_note: String(note).trim(),
        }),

        reason: String(note).trim(),
      });

      // NOTIFY EMPLOYEE

      await notifyUser(trx, {
        userId: request.user_id,
        actorId: adminId,

        type: "REGULARIZATION_REJECTED",

        title: "Attendance Regularization Rejected",

        message: `Your ${request.type} regularization request for ${formatDateOnly(request.work_date)} has been rejected.`,

        entityId: request.id,

        data: {
          work_date: formatDateOnly(request.work_date),
          type: request.type,
          claimed_in: request.claimed_in,
          claimed_out: request.claimed_out,
          status: "REJECTED",
          decision_note: String(note).trim(),
        },
      });

      return {
        success: true,

        message: "Regularization request rejected successfully",

        data: {
          regularization_request: rejectedRequest,
        },
      };
    }

    // =================================================
    // APPROVE
    // =================================================

    const correctionPunches = [];

    // MISSED IN

    if (
      request.type === "MISSED_IN" ||
      request.type === "BOTH"
    ) {
      correctionPunches.push({
        user_id: request.user_id,
        punched_at: request.claimed_in,
        direction: "IN",
        source: "REGULARIZATION",
        regularization_id: request.id,
        created_by: adminId,
        reason: request.reason,
        is_voided: false,
      });
    }

    // MISSED OUT

    if (
      request.type === "MISSED_OUT" ||
      request.type === "BOTH"
    ) {
      correctionPunches.push({
        user_id: request.user_id,
        punched_at: request.claimed_out,
        direction: "OUT",
        source: "REGULARIZATION",
        regularization_id: request.id,
        created_by: adminId,
        reason: request.reason,
        is_voided: false,
      });
    }

    // INSERT CORRECTION PUNCHES

    const insertedPunches = correctionPunches.length
      ? await trx("correction_punches")
          .insert(correctionPunches)
          .returning([
            "id",
            "user_id",
            "punched_at",
            "direction",
            "source",
            "regularization_id",
            "created_by",
            "reason",
            "is_voided",
            "created_at",
          ])
      : [];

    // RECOMPUTE ATTENDANCE

    await recomputeDay(
      request.user_id,
      request.work_date,
      trx
    );

    // UPDATE REGULARIZATION REQUEST

    const [approvedRequest] = await trx(
      "regularization_requests"
    )
      .where({
        id: request.id,
        status: "PENDING",
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
        "work_date",
        "type",
        "claimed_in",
        "claimed_out",
        "reason",
        "status",
        "decided_by",
        "decided_at",
        "decision_note",
        "created_at",
        "updated_at",
      ]);

    // GET UPDATED DAY SUMMARY

    const updatedDaySummary = await trx("day_summaries")
      .where({
        user_id: request.user_id,
        work_date: request.work_date,
      })
      .first();

    // AUDIT

    await trx("audit_log").insert({
      actor_id: adminId,
      action: "REGULARIZATION_APPROVED",
      entity_type: "regularization_requests",
      entity_id: request.id,

      before: JSON.stringify({
        status: "PENDING",
      }),

      after: JSON.stringify({
        status: "APPROVED",
        decided_by: adminId,
        decision_note: String(note).trim(),
        correction_punch_ids: insertedPunches.map(
          (punch) => punch.id
        ),
      }),

      reason: String(note).trim(),
    });

    // NOTIFY EMPLOYEE

    await notifyUser(trx, {
      userId: request.user_id,
      actorId: adminId,

      type: "REGULARIZATION_APPROVED",

      title: "Attendance Regularization Approved",

      message: `Your ${request.type} regularization request for ${formatDateOnly(request.work_date)} has been approved.`,

      entityId: request.id,

      data: {
        work_date: formatDateOnly(request.work_date),
        type: request.type,
        claimed_in: request.claimed_in,
        claimed_out: request.claimed_out,
        status: "APPROVED",
        decision_note: String(note).trim(),

        correction_punch_ids: insertedPunches.map(
          (punch) => punch.id
        ),
      },
    });

    // RESPONSE

    return {
      success: true,

      message: "Regularization request approved successfully",

      data: {
        regularization_request: approvedRequest,
        correction_punches: insertedPunches,
        day_summary: updatedDaySummary,
      },
    };
  });
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  applyMyRegularization,
  getMyRegularizations,
  getAdminRegularizationRequests,
  decideAdminRegularization,
};