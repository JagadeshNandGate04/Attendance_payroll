const knex = require("../config/database");

const {
  DIRECTIONS,
  validateMonthYear,
  validateDate,
  validateUserId,
  getMonthRange,
  removeDuplicatePunches,
  buildSessions,
  calculateBreakMinutes,
} = require("../utils/attendanceUtils");

const { formatDateOnly } = require("../utils/dateHelpers");

// =====================================================
// CONSTANTS
// =====================================================

const STATUS = {
  PRESENT: "PRESENT",
  HALF_DAY: "HALF_DAY",
  ABSENT: "ABSENT",
  LEAVE: "LEAVE",
  HOLIDAY: "HOLIDAY",
  WEEKLY_OFF: "WEEKLY_OFF",
  INSUFFICIENT: "INSUFFICIENT",
};

const MAX_LOP_VALUE = 2;
const LOP_STEP = 0.5;

// =====================================================
// HELPER - NORMALIZE DATE KEY
// =====================================================

function normalizeDateKey(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return String(value).slice(0, 10);
}

// HELPER LOP

async function getLatestLopAdjustments({
  userId = null,
  startDate,
  endExclusive,
  trx = knex,
}) {
  let query = trx("attendance_lop_adjustments")
    .where("work_date", ">=", startDate)
    .where("work_date", "<", endExclusive)
    .orderBy("id", "desc");

  // Filter by employee only when userId is provided.
  if (userId !== null && userId !== undefined) {
    query = query.where("user_id", userId);
  }

  const adjustments = await query;

  const adjustmentMap = new Map();

  for (const adjustment of adjustments) {
    const userKey = String(adjustment.user_id);

    const dateKey = normalizeDateKey(
      adjustment.work_date
    );

    // Keep only the latest adjustment for each employee/date.
    const key = `${userKey}_${dateKey}`;

    if (!adjustmentMap.has(key)) {
      adjustmentMap.set(key, adjustment);
    }
  }

  // Return a user-keyed map for a single date.
  // For a date range, return a map keyed by user/date.
  if (startDate && endExclusive) {
    const isSingleDay =
      new Date(`${startDate}T00:00:00Z`).getTime() +
        86400000 ===
      new Date(`${endExclusive}T00:00:00Z`).getTime();

    if (isSingleDay) {
      const dailyMap = new Map();

      for (const adjustment of adjustmentMap.values()) {
        dailyMap.set(
          String(adjustment.user_id),
          adjustment
        );
      }

      return dailyMap;
    }
  }

  return adjustmentMap;
}


// =====================================================
// HELPER - GET FINAL LOP VALUE
// =====================================================

function getFinalLopValue(summary, adjustment) {
  const calculatedLop = Number(summary?.lop_value || 0);

  // Manual adjustments only apply to ABSENT days.
  // If the status changes, use the newly calculated LOP.

  if (
    summary &&
    summary.status === STATUS.ABSENT &&
    adjustment
  ) {
    return Number(adjustment.new_lop);
  }

  return calculatedLop;
}

// =====================================================
// HELPER - FORMAT LOP DETAILS
// =====================================================

function formatLopDetails(summary, adjustment) {
  const calculatedLop = Number(summary?.lop_value || 0);

  const isAdjustmentActive =
    Boolean(
      summary &&
      summary.status === STATUS.ABSENT &&
      adjustment
    );

  const finalLop = isAdjustmentActive
    ? Number(adjustment.new_lop)
    : calculatedLop;

  return {
    calculated_lop_value: calculatedLop,

    adjusted_lop_value: isAdjustmentActive
      ? Number(adjustment.new_lop)
      : null,

    lop_value: finalLop,

    lop_adjustment: isAdjustmentActive
      ? adjustment
      : null,
  };
}

// =====================================================
// NOTIFICATION HELPER
// =====================================================

async function notifyUser(
  trx,
  {
    userId,
    actorId,
    type,
    title,
    message,
    entityId,
    data = {},
  }
) {
  await trx("notifications").insert({
    user_id: userId,
    actor_id: actorId,
    type,
    title,
    message,
    entity_type: "correction_punch",
    entity_id: entityId,
    data,
  });
}

// =====================================================
// HELPER - GET SETTINGS
// =====================================================

async function getSetting(key, trx = knex) {
  const row = await trx("settings")
    .where({ key })
    .first();

  if (!row) {
    return null;
  }

  let value = row.value;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      // Keep normal string value.
    }
  }

  return value;
}

// =====================================================
// HELPER - GET NUMBER SETTING
// =====================================================

async function getNumberSetting(
  key,
  defaultValue,
  trx = knex
) {
  const value = await getSetting(key, trx);

  if (value === null || value === undefined) {
    return defaultValue;
  }

  const numberValue = Number(value);

  return Number.isNaN(numberValue)
    ? defaultValue
    : numberValue;
}

// =====================================================
// HELPER - GET EMPLOYEE
// =====================================================

async function getEmployee(userId, trx = knex) {
  const employee = await trx("users")
    .select(
      "id",
      "emp_code",
      "name",
      "email",
      "phone",
      "role",
      "designation",
      "date_of_joining",
      "status"
    )
    .where({
      id: userId,
    })
    .first();

  if (!employee) {
    throw new Error("Employee not found");
  }

  return employee;
}

// =====================================================
// HELPER - GET HOLIDAY
// =====================================================

async function getHoliday(date, trx = knex) {
  return trx("holidays")
    .where({
      holiday_date: date,
    })
    .first();
}

// =====================================================
// HELPER - CHECK WEEKLY OFF
// =====================================================

async function isWeeklyOff(date, trx = knex) {
  const weeklyOffDays = await getSetting(
    "weekly_off_days",
    trx
  );

  let days = [0, 6];

  if (Array.isArray(weeklyOffDays)) {
    days = weeklyOffDays.map(Number);
  }

  const dateObject = new Date(`${date}T00:00:00Z`);

  const day = dateObject.getUTCDay();

  return days.includes(day);
}

// =====================================================
// HELPER - GET APPROVED LEAVE
// =====================================================

async function getApprovedLeaveForDate(
  userId,
  date,
  trx = knex
) {
  return trx("leave_requests")
    .where({
      user_id: userId,
      status: "APPROVED",
    })
    .where("from_date", "<=", date)
    .where("to_date", ">=", date)
    .first();
}

// =====================================================
// HELPER - GET APPROVED PERMISSIONS
// =====================================================

async function getApprovedPermissionsForDate(
  userId,
  date,
  trx = knex
) {
  return trx("permission_requests")
    .where({
      user_id: userId,
      perm_date: date,
      status: "APPROVED",
    })
    .orderBy("start_time", "asc");
}

// =====================================================
// HELPER - GET RAW + CORRECTION PUNCHES
// =====================================================

async function getPunchesForDate(
  user,
  date,
  trx = knex
) {
  const start = `${date} 00:00:00`;

  const nextDate = new Date(`${date}T00:00:00Z`);

  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const nextDateString = nextDate.toISOString().slice(0, 10);

  const end = `${nextDateString} 00:00:00`;

  const rawPunches = await trx("raw_punches")
    .select(
      "id",
      "emp_code",
      "punched_at",
      "direction",
      "verify_mode",
      "device_id"
    )
    .where({
      emp_code: user.emp_code,
    })
    .where("punched_at", ">=", start)
    .where("punched_at", "<", end)
    .orderBy("punched_at", "asc");

  const corrections = await trx("correction_punches")
    .select(
      "correction_punches.id",
      "correction_punches.user_id",
      "correction_punches.punched_at",
      "correction_punches.direction",
      "correction_punches.source",
      "correction_punches.regularization_id",
      "correction_punches.created_by",
      "correction_punches.reason",
      "correction_punches.is_voided",
      "users.name as created_by_name"
    )
    .leftJoin(
      "users",
      "users.id",
      "correction_punches.created_by"
    )
    .where({
      "correction_punches.user_id": user.id,
      "correction_punches.is_voided": false,
    })
    .where("correction_punches.punched_at", ">=", start)
    .where("correction_punches.punched_at", "<", end)
    .orderBy("correction_punches.punched_at", "asc");

  const raw = rawPunches.map((punch) => ({
    ...punch,
    source_type: "RAW",
    correction_id: null,
    is_correction: false,
  }));

  const corrected = corrections.map((punch) => ({
    ...punch,
    source_type: "CORRECTION",
    correction_id: punch.id,
    is_correction: true,
  }));

  return [...raw, ...corrected].sort(
    (a, b) =>
      new Date(a.punched_at) - new Date(b.punched_at)
  );
}

// =====================================================
// HELPER - CALCULATE DAY SUMMARY
// =====================================================

async function calculateDaySummary({
  user,
  date,
  sessions,
  trx,
}) {
  const holiday = await getHoliday(date, trx);

  const weeklyOff = await isWeeklyOff(date, trx);

  const leave = await getApprovedLeaveForDate(
    user.id,
    date,
    trx
  );

  const permissions = await getApprovedPermissionsForDate(
    user.id,
    date,
    trx
  );

  const permissionMin = permissions.reduce(
    (sum, item) =>
      sum + Number(item.minutes || 0),
    0
  );

  if (holiday) {
    return {
      status: STATUS.HOLIDAY,
      first_in: null,
      last_out: null,
      work_min: 0,
      break_min: 0,
      permission_min: permissionMin,
      is_late: false,
      excess_break: false,
      needs_regularization: false,
      lop_value: 0,
    };
  }

  if (weeklyOff) {
    return {
      status: STATUS.WEEKLY_OFF,
      first_in: null,
      last_out: null,
      work_min: 0,
      break_min: 0,
      permission_min: permissionMin,
      is_late: false,
      excess_break: false,
      needs_regularization: false,
      lop_value: 0,
    };
  }

  if (leave) {
    return {
      status: STATUS.LEAVE,
      first_in: null,
      last_out: null,
      work_min: 0,
      break_min: 0,
      permission_min: permissionMin,
      is_late: false,
      excess_break: false,
      needs_regularization: false,
      lop_value: 0,
    };
  }

  const completedSessions = sessions.filter(
    (session) =>
      session.in_at &&
      session.out_at &&
      session.duration_min !== null
  );

  const workMin = completedSessions.reduce(
    (sum, session) =>
      sum + Number(session.duration_min || 0),
    0
  );

  const breakMin = calculateBreakMinutes(sessions);

  const firstIn =
    sessions
      .filter((session) => session.in_at)
      .map((session) => session.in_at)
      .sort(
        (a, b) =>
          new Date(a) - new Date(b)
      )[0] || null;

  const lastOut =
    sessions
      .filter((session) => session.out_at)
      .map((session) => session.out_at)
      .sort(
        (a, b) =>
          new Date(b) - new Date(a)
      )[0] || null;

  const needsRegularization = sessions.some(
    (session) =>
      session.flag === "MISSING_IN" ||
      session.flag === "MISSING_OUT"
  );

  const shift = await getSetting("shift", trx);

  const graceMin = await getNumberSetting(
    "grace_min",
    10,
    trx
  );

  const breakAllowanceMin = await getNumberSetting(
    "break_allowance_min",
    60,
    trx
  );

  const fullDayHours = await getNumberSetting(
    "full_day_hours",
    8,
    trx
  );

  const halfDayHours = await getNumberSetting(
    "half_day_hours",
    4,
    trx
  );

  const fullDayMin = fullDayHours * 60;

  const halfDayMin = halfDayHours * 60;

  let isLate = false;

  if (firstIn && shift && shift.start) {
    const shiftStart = new Date(
      `${date}T${shift.start}:00+05:30`
    );

    const actualIn = new Date(firstIn);

    const lateMinutes = Math.floor(
      (actualIn - shiftStart) / 60000
    );

    isLate = lateMinutes > graceMin;
  }

  const excessBreak =
    breakMin > breakAllowanceMin;

  let status = STATUS.ABSENT;

  let lopValue = 2;

  if (needsRegularization) {
    status = STATUS.INSUFFICIENT;
    lopValue = 0.5;
  } else if (workMin >= fullDayMin) {
    status = STATUS.PRESENT;
    lopValue = 0;
  } else if (workMin >= halfDayMin) {
    status = STATUS.HALF_DAY;
    lopValue = 0.5;
  } else {
    status = STATUS.ABSENT;
    lopValue = 2;
  }

  return {
    status,
    first_in: firstIn,
    last_out: lastOut,
    work_min: workMin,
    break_min: breakMin,
    permission_min: permissionMin,
    is_late: isLate,
    excess_break: excessBreak,
    needs_regularization: needsRegularization,
    lop_value: lopValue,
  };
}

// =====================================================
// HELPER - RECOMPUTE ONE DAY
// =====================================================

async function recomputeDay(userId, date, trx = null) {
  // Reuse an existing transaction or create a new one.
  if (!trx) {
    return knex.transaction(async (transaction) => {
      return recomputeDay(userId, date, transaction);
    });
  }

  const normalizedDate = formatDateOnly(date);

  const user = await getEmployee(userId, trx);

  // Lock the existing summary row to prevent concurrent recalculation.
  const existingSummary = await trx("day_summaries")
    .where({
      user_id: userId,
      work_date: normalizedDate,
    })
    .forUpdate()
    .first();

  if (existingSummary && existingSummary.is_locked) {
    throw new Error("MONTH_LOCKED");
  }

  let punches = await getPunchesForDate(
    user,
    normalizedDate,
    trx
  );

  const duplicateWindow = await getNumberSetting(
    "duplicate_punch_window_min",
    3,
    trx
  );

  punches = removeDuplicatePunches(
    punches,
    duplicateWindow
  );

  const sessions = buildSessions(punches);

  const summary = await calculateDaySummary({
    user,
    date: normalizedDate,
    sessions,
    trx,
  });

  await trx("attendance_sessions")
    .where({
      user_id: userId,
      work_date: normalizedDate,
    })
    .del();

  if (sessions.length > 0) {
    await trx("attendance_sessions").insert(
      sessions.map((session) => ({
        user_id: userId,
        work_date: normalizedDate,
        in_at: session.in_at,
        out_at: session.out_at,
        duration_min: session.duration_min,
        flag: session.flag,
      }))
    );
  }

  const isLocked = existingSummary
    ? existingSummary.is_locked
    : false;

  await trx("day_summaries")
    .insert({
      user_id: userId,
      work_date: normalizedDate,
      status: summary.status,
      first_in: summary.first_in,
      last_out: summary.last_out,
      work_min: summary.work_min,
      break_min: summary.break_min,
      permission_min: summary.permission_min,
      is_late: summary.is_late,
      excess_break: summary.excess_break,
      needs_regularization: summary.needs_regularization,
      lop_value: summary.lop_value,
      is_locked: isLocked,
    })
    .onConflict(["user_id", "work_date"])
    .merge({
      status: summary.status,
      first_in: summary.first_in,
      last_out: summary.last_out,
      work_min: summary.work_min,
      break_min: summary.break_min,
      permission_min: summary.permission_min,
      is_late: summary.is_late,
      excess_break: summary.excess_break,
      needs_regularization: summary.needs_regularization,
      lop_value: summary.lop_value,
      updated_at: trx.fn.now(),
    });

  return {
    sessions,
    summary,
  };
}

// GET MY ATTENDANCE

async function getMyAttendance({
  userId,
  empCode,
  month,
  year,
}) {
  const validated = validateMonthYear(month, year);

  const employee = await getEmployee(userId);

  if (empCode && employee.emp_code !== empCode) {
    throw new Error("Employee identity mismatch");
  }

  const { startDate, endExclusive } = getMonthRange(
    validated.year,
    validated.month
  );

  const daySummaries = await knex("day_summaries")
    .select(
      "id",
      "work_date",
      "status",
      "first_in",
      "last_out",
      "work_min",
      "break_min",
      "permission_min",
      "is_late",
      "excess_break",
      "needs_regularization",
      "lop_value",
      "is_locked"
    )
    .where({ user_id: userId })
    .where("work_date", ">=", startDate)
    .where("work_date", "<", endExclusive)
    .orderBy("work_date", "asc");

  // GET LATEST LOP ADJUSTMENTS
  const adjustmentMap = await getLatestLopAdjustments({
    userId,
    startDate,
    endExclusive,
  });

  const formattedDaySummaries = daySummaries.map((day) => {
    const date = normalizeDateKey(day.work_date);

    // IMPORTANT: Monthly map key = userId_workDate
    const adjustment =
      adjustmentMap.get(`${userId}_${date}`) || null;

    return {
      ...day,
      work_date: date,
      ...formatLopDetails(day, adjustment),
    };
  });

  const totals = {
    present: 0,
    half: 0,
    absent: 0,
    leave: 0,
    holiday: 0,
    weekly_off: 0,
    insufficient: 0,
    late_count: 0,
    work_hours: 0,
    work_minutes: 0,
    calculated_lop: 0,
    lop_adjustment: 0,
    lop_value: 0,
  };

  for (const day of formattedDaySummaries) {
    switch (day.status) {
      case STATUS.PRESENT:
        totals.present++;
        break;
      case STATUS.HALF_DAY:
        totals.half++;
        break;
      case STATUS.ABSENT:
        totals.absent++;
        break;
      case STATUS.LEAVE:
        totals.leave++;
        break;
      case STATUS.HOLIDAY:
        totals.holiday++;
        break;
      case STATUS.WEEKLY_OFF:
        totals.weekly_off++;
        break;
      case STATUS.INSUFFICIENT:
        totals.insufficient++;
        break;
    }

    if (day.is_late) {
      totals.late_count++;
    }

    totals.work_minutes += Number(day.work_min || 0);

    totals.calculated_lop += Number(
      day.calculated_lop_value || 0
    );

    totals.lop_value += Number(day.lop_value || 0);

    totals.lop_adjustment +=
      Number(day.lop_value || 0) -
      Number(day.calculated_lop_value || 0);
  }

  totals.work_hours = Number(
    (totals.work_minutes / 60).toFixed(2)
  );

  totals.calculated_lop = Number(
    totals.calculated_lop.toFixed(2)
  );

  totals.lop_adjustment = Number(
    totals.lop_adjustment.toFixed(2)
  );

  totals.lop_value = Number(
    totals.lop_value.toFixed(2)
  );

  // TODAY LIVE STATUS
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  let liveStatus = "OUT";
  let lastPunch = null;

  if (today >= startDate && today < endExclusive) {
    const punches = await getPunchesForDate(employee, today);

    const duplicateWindow = await getNumberSetting(
      "duplicate_punch_window_min",
      3
    );

    const validPunches = removeDuplicatePunches(
      punches,
      duplicateWindow
    );

    lastPunch = validPunches.length
      ? validPunches[validPunches.length - 1]
      : null;

    if (
      lastPunch &&
      lastPunch.direction === DIRECTIONS.IN
    ) {
      liveStatus = "IN";
    }
  }

  return {
    success: true,
    data: {
      employee: {
        id: employee.id,
        emp_code: employee.emp_code,
        name: employee.name,
        designation: employee.designation,
      },
      month: validated.month,
      year: validated.year,
      day_summaries: formattedDaySummaries,
      today: {
        date: today,
        status: liveStatus,
        last_punch: lastPunch,
      },
      totals,
    },
  };
}

// GET MY ATTENDANCE FOR A SPECIFIC DAY


async function getMyAttendanceDay({
  userId,
  empCode,
  date,
}) {
  const validatedDate = validateDate(date);

  const employee = await getEmployee(userId);

  if (empCode && employee.emp_code !== empCode) {
    throw new Error("Employee identity mismatch");
  }

  const punches = await getPunchesForDate(
    employee,
    validatedDate
  );

  const duplicateWindow = await getNumberSetting(
    "duplicate_punch_window_min",
    3
  );

  const cleanedPunches = removeDuplicatePunches(
    punches,
    duplicateWindow
  );

  const calculatedSessions = buildSessions(cleanedPunches);

  const summary = await knex("day_summaries")
    .where({
      user_id: userId,
      work_date: validatedDate,
    })
    .first();

  const sessions = await knex("attendance_sessions")
    .select(
      "id",
      "user_id",
      "work_date",
      "in_at",
      "out_at",
      "duration_min",
      "flag"
    )
    .where({
      user_id: userId,
      work_date: validatedDate,
    })
    .orderBy("in_at", "asc");

  const leave = await getApprovedLeaveForDate(
    userId,
    validatedDate
  );

  const permissions = await getApprovedPermissionsForDate(
    userId,
    validatedDate
  );

  // GET LATEST LOP ADJUSTMENT
  const nextDate = new Date(
    `${validatedDate}T00:00:00Z`
  );

  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const endExclusive = nextDate.toISOString().slice(0, 10);

  const adjustmentMap = await getLatestLopAdjustments({
    userId,
    startDate: validatedDate,
    endExclusive,
  });

  // IMPORTANT: Single-day map key = userId
  const adjustment =
    adjustmentMap.get(String(userId)) || null;

  const formattedSummary = summary
    ? {
        ...summary,
        work_date: validatedDate,
        ...formatLopDetails(summary, adjustment),
      }
    : null;

  const breakGaps = [];

  const completed = calculatedSessions
    .filter(
      (session) => session.in_at && session.out_at
    )
    .sort(
      (a, b) =>
        new Date(a.in_at) - new Date(b.in_at)
    );

  for (let i = 1; i < completed.length; i++) {
    const previous = completed[i - 1];
    const current = completed[i];

    const gap = Math.floor(
      (
        new Date(current.in_at) -
        new Date(previous.out_at)
      ) / 60000
    );

    if (gap > 0) {
      breakGaps.push({
        from: previous.out_at,
        to: current.in_at,
        minutes: gap,
      });
    }
  }

  return {
    success: true,
    data: {
      employee: {
        id: employee.id,
        emp_code: employee.emp_code,
        name: employee.name,
        designation: employee.designation,
      },
      date: validatedDate,
      summary: formattedSummary,
      sessions,
      punches: cleanedPunches,
      break_gaps: breakGaps,
      flags: {
        needs_regularization: summary
          ? summary.needs_regularization
          : calculatedSessions.some(
              (session) => session.flag
            ),
        is_late: summary ? summary.is_late : false,
        excess_break: summary ? summary.excess_break : false,
        is_locked: summary ? summary.is_locked : false,
      },
      leave,
      permissions,
    },
  };
}


// =====================================================
// ADMIN - GET DAILY ATTENDANCE
// =====================================================

async function getAdminDailyAttendance({ date }) {
  const validatedDate = validateDate(date);

  const nextDate = new Date(
    `${validatedDate}T00:00:00Z`
  );

  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const endExclusive = nextDate.toISOString().slice(0, 10);

  // ---------------------------------------------------
  // GET EMPLOYEES
  // ---------------------------------------------------

  const employees = await knex("users")
    .select(
      "id",
      "emp_code",
      "name",
      "email",
      "designation",
      "status"
    )
    .where({
      role: "EMPLOYEE",
    })
    .orderBy("name", "asc");

  // ---------------------------------------------------
  // GET DAY SUMMARIES
  // ---------------------------------------------------

  const summaries = await knex("day_summaries")
    .where({
      work_date: validatedDate,
    });

  const summaryMap = new Map(
    summaries.map((summary) => [
      String(summary.user_id),
      summary,
    ])
  );

  // ---------------------------------------------------
  // GET LATEST LOP ADJUSTMENTS
  // ---------------------------------------------------

  const lopAdjustments = await getLatestLopAdjustments({
    startDate: validatedDate,
    endExclusive,
  });

  // ---------------------------------------------------
  // GET RAW PUNCHES
  // ---------------------------------------------------

  const rawPunches = await knex("raw_punches")
    .select(
      "emp_code",
      "punched_at",
      "direction"
    )
    .where(
      "punched_at",
      ">=",
      `${validatedDate} 00:00:00`
    )
    .where(
      "punched_at",
      "<",
      `${endExclusive} 00:00:00`
    )
    .orderBy("punched_at", "asc");

  // ---------------------------------------------------
  // GET VALID CORRECTION PUNCHES
  // ---------------------------------------------------

  const corrections = await knex("correction_punches")
    .select(
      "user_id",
      "punched_at",
      "direction"
    )
    .where({
      is_voided: false,
    })
    .where(
      "punched_at",
      ">=",
      `${validatedDate} 00:00:00`
    )
    .where(
      "punched_at",
      "<",
      `${endExclusive} 00:00:00`
    )
    .orderBy("punched_at", "asc");

  // ---------------------------------------------------
  // GROUP RAW PUNCHES
  // ---------------------------------------------------

  const rawMap = new Map();

  for (const punch of rawPunches) {
    if (!rawMap.has(punch.emp_code)) {
      rawMap.set(punch.emp_code, []);
    }

    rawMap.get(punch.emp_code).push(punch);
  }

  // ---------------------------------------------------
  // GROUP CORRECTION PUNCHES
  // ---------------------------------------------------

  const correctionMap = new Map();

  for (const punch of corrections) {
    const key = String(punch.user_id);

    if (!correctionMap.has(key)) {
      correctionMap.set(key, []);
    }

    correctionMap.get(key).push(punch);
  }

  // ---------------------------------------------------
  // BUILD EMPLOYEE ATTENDANCE
  // ---------------------------------------------------

  const data = employees.map((employee) => {
    const summary =
      summaryMap.get(String(employee.id)) || null;

    const employeeRaw =
      rawMap.get(employee.emp_code) || [];

    const employeeCorrections =
      correctionMap.get(String(employee.id)) || [];

    const punches = [
      ...employeeRaw,
      ...employeeCorrections,
    ].sort(
      (a, b) =>
        new Date(a.punched_at) -
        new Date(b.punched_at)
    );

    // -------------------------------------------------
    // FIRST IN
    // -------------------------------------------------

    const firstIn =
      punches.find(
        (punch) =>
          punch.direction === DIRECTIONS.IN
      ) || null;

    // -------------------------------------------------
    // LAST OUT
    // -------------------------------------------------

    const lastOut =
      [...punches]
        .reverse()
        .find(
          (punch) =>
            punch.direction === DIRECTIONS.OUT
        ) || null;

    // -------------------------------------------------
    // LIVE STATUS
    // -------------------------------------------------

    let liveStatus = "OUT";

    const lastPunch = punches.length
      ? punches[punches.length - 1]
      : null;

    if (
      lastPunch &&
      lastPunch.direction === DIRECTIONS.IN
    ) {
      liveStatus = "IN";
    }

    // -------------------------------------------------
    // LOP CALCULATION
    // -------------------------------------------------

    const calculatedLop = summary
      ? Number(summary.lop_value || 0)
      : 0;

    const adjustment =
      lopAdjustments.get(String(employee.id)) || null;

    // Apply manual adjustment only to current ABSENT status.
    const isAdjustmentApplicable =
      Boolean(
        summary &&
        summary.status === STATUS.ABSENT &&
        adjustment
      );

    const adjustedLopValue =
      isAdjustmentApplicable
        ? Number(adjustment.new_lop)
        : null;

    const finalLopValue =
      isAdjustmentApplicable
        ? adjustedLopValue
        : calculatedLop;

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return {
      user_id: employee.id,
      emp_code: employee.emp_code,
      name: employee.name,
      designation: employee.designation,

      status: summary
        ? summary.status
        : STATUS.ABSENT,

      live_status: liveStatus,

      first_in: summary
        ? summary.first_in
        : firstIn
          ? firstIn.punched_at
          : null,

      last_out: summary
        ? summary.last_out
        : lastOut
          ? lastOut.punched_at
          : null,

      work_min: summary
        ? Number(summary.work_min || 0)
        : 0,

      calculated_lop_value: calculatedLop,

      adjusted_lop_value: adjustedLopValue,

      lop_value: finalLopValue,

      lop_adjustment: isAdjustmentApplicable
        ? {
            id: adjustment.id,
            previous_lop: Number(adjustment.previous_lop),
            new_lop: Number(adjustment.new_lop),
            reason: adjustment.reason,
            created_by: adjustment.created_by,
            created_at: adjustment.created_at,
          }
        : null,

      flags: {
        is_late: summary
          ? summary.is_late
          : false,

        excess_break: summary
          ? summary.excess_break
          : false,

        needs_regularization: summary
          ? summary.needs_regularization
          : false,
      },

      is_locked: summary
        ? summary.is_locked
        : false,
    };
  });

  // ---------------------------------------------------
  // RETURN RESPONSE
  // ---------------------------------------------------

  return {
    success: true,

    data: {
      date: validatedDate,
      employees: data,
      total: data.length,
    },
  };
}

// =====================================================
// ADMIN - GET MONTHLY ATTENDANCE
// =====================================================

async function getAdminMonthlyAttendance({
  userId,
  month,
  year,
}) {
  const validatedUserId = validateUserId(userId);

  const validated = validateMonthYear(month, year);

  const employee = await getEmployee(validatedUserId);

  const { startDate, endExclusive } = getMonthRange(
    validated.year,
    validated.month
  );

  const getISTDateKey = (value) => {
    if (!value) return null;

    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  };

  // 1. DAILY SUMMARIES

  const summaries = await knex("day_summaries")
    .where({
      user_id: validatedUserId,
    })
    .where("work_date", ">=", startDate)
    .where("work_date", "<", endExclusive)
    .orderBy("work_date", "asc");

  const summaryMap = new Map(
    summaries.map((summary) => [
      normalizeDateKey(summary.work_date),
      summary,
    ])
  );

  // 2. LATEST LOP ADJUSTMENTS

  const adjustmentMap = await getLatestLopAdjustments({
    userId: validatedUserId,
    startDate,
    endExclusive,
  });

  // 3. ATTENDANCE SESSIONS

  const sessions = await knex("attendance_sessions")
    .where({
      user_id: validatedUserId,
    })
    .where("work_date", ">=", startDate)
    .where("work_date", "<", endExclusive)
    .orderBy("work_date", "asc")
    .orderBy("in_at", "asc");

  const sessionsMap = new Map();

  for (const session of sessions) {
    const date = normalizeDateKey(session.work_date);

    if (!sessionsMap.has(date)) {
      sessionsMap.set(date, []);
    }

    sessionsMap.get(date).push(session);
  }

  // 4. RAW PUNCHES

  const rawPunches = await knex("raw_punches")
    .where({
      emp_code: employee.emp_code,
    })
    .where("punched_at", ">=", startDate)
    .where("punched_at", "<", endExclusive)
    .orderBy("punched_at", "asc");

  const rawMap = new Map();

  for (const punch of rawPunches) {
    const date = getISTDateKey(punch.punched_at);

    if (!rawMap.has(date)) {
      rawMap.set(date, []);
    }

    rawMap.get(date).push({
      ...punch,
      source_type: "RAW",
      is_correction: false,
    });
  }

  // 5. CORRECTION PUNCHES

  const corrections = await knex("correction_punches")
    .select(
      "correction_punches.*",
      "users.name as created_by_name"
    )
    .leftJoin(
      "users",
      "users.id",
      "correction_punches.created_by"
    )
    .where({
      "correction_punches.user_id": validatedUserId,
    })
    .where(
      "correction_punches.punched_at",
      ">=",
      startDate
    )
    .where(
      "correction_punches.punched_at",
      "<",
      endExclusive
    )
    .orderBy(
      "correction_punches.punched_at",
      "asc"
    );

  const correctionMap = new Map();

  for (const correction of corrections) {
    const date = getISTDateKey(correction.punched_at);

    if (!correctionMap.has(date)) {
      correctionMap.set(date, []);
    }

    correctionMap.get(date).push({
      ...correction,
      source_type: "CORRECTION",
      is_correction: true,
    });
  }

  // 6. LEAVES

  const leaves = await knex("leave_requests")
    .where({
      user_id: validatedUserId,
    })
    .where("from_date", "<", endExclusive)
    .where("to_date", ">=", startDate)
    .orderBy("from_date", "asc");

  // 7. PERMISSIONS

  const permissions = await knex("permission_requests")
    .where({
      user_id: validatedUserId,
    })
    .where("perm_date", ">=", startDate)
    .where("perm_date", "<", endExclusive)
    .orderBy("perm_date", "asc")
    .orderBy("start_time", "asc");

  // 8. BUILD DAILY ATTENDANCE RESPONSE

  const days = [];

  const cursor = new Date(`${startDate}T00:00:00Z`);

  const end = new Date(`${endExclusive}T00:00:00Z`);

  while (cursor < end) {
    const date = cursor.toISOString().slice(0, 10);

    const daySummary = summaryMap.get(date) || null;

    const daySessions = sessionsMap.get(date) || [];

    const dayRaw = rawMap.get(date) || [];

    const dayCorrections = correctionMap.get(date) || [];

    const allPunches = [
      ...dayRaw,
      ...dayCorrections,
    ].sort(
      (a, b) =>
        new Date(a.punched_at).getTime() -
        new Date(b.punched_at).getTime()
    );

    const adjustment = adjustmentMap.get(date) || null;

    const lopDetails = daySummary
      ? formatLopDetails(daySummary, adjustment)
      : {
          calculated_lop_value: 0,
          adjusted_lop_value: null,
          lop_value: 0,
          lop_adjustment: null,
        };

    const formattedSummary = daySummary
      ? {
          ...daySummary,
          work_date: date,
          ...lopDetails,
        }
      : null;

    const formattedSessions = daySessions.map(
      (session) => ({
        ...session,
        work_date: date,
      })
    );

    const dayLeaves = leaves.filter(
      (leave) =>
        normalizeDateKey(leave.from_date) <= date &&
        normalizeDateKey(leave.to_date) >= date &&
        leave.status === "APPROVED"
    );

    const dayPermissions = permissions.filter(
      (permission) =>
        normalizeDateKey(permission.perm_date) === date
    );

    days.push({
      date,

      summary: formattedSummary,

      // Also provide LOP values at day level.

      calculated_lop_value:
        lopDetails.calculated_lop_value,

      adjusted_lop_value:
        lopDetails.adjusted_lop_value,

      lop_value:
        lopDetails.lop_value,

      lop_adjustment:
        lopDetails.lop_adjustment,

      punches: allPunches,

      raw_punches: dayRaw,

      corrections: dayCorrections,

      sessions: formattedSessions,

      leave: dayLeaves,

      permissions: dayPermissions,

      flags: {
        is_late: daySummary
          ? daySummary.is_late
          : false,

        excess_break: daySummary
          ? daySummary.excess_break
          : false,

        needs_regularization: daySummary
          ? daySummary.needs_regularization
          : false,

        is_locked: daySummary
          ? daySummary.is_locked
          : false,
      },
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // 9. MONTHLY TOTALS

  const totals = {
    present: 0,
    half: 0,
    absent: 0,
    leave: 0,
    holiday: 0,
    weekly_off: 0,
    insufficient: 0,
    late_count: 0,
    work_minutes: 0,
    work_hours: 0,

    calculated_lop: 0,
    lop_adjustment: 0,
    lop_value: 0,
  };

  for (const day of days) {
    const summary = day.summary;

    if (!summary) {
      continue;
    }

    switch (summary.status) {
      case STATUS.PRESENT:
        totals.present++;
        break;

      case STATUS.HALF_DAY:
        totals.half++;
        break;

      case STATUS.ABSENT:
        totals.absent++;
        break;

      case STATUS.LEAVE:
        totals.leave++;
        break;

      case STATUS.HOLIDAY:
        totals.holiday++;
        break;

      case STATUS.WEEKLY_OFF:
        totals.weekly_off++;
        break;

      case STATUS.INSUFFICIENT:
        totals.insufficient++;
        break;
    }

    if (summary.is_late) {
      totals.late_count++;
    }

    totals.work_minutes += Number(
      summary.work_min || 0
    );

    totals.calculated_lop += Number(
      day.calculated_lop_value || 0
    );

    totals.lop_value += Number(
      day.lop_value || 0
    );

    totals.lop_adjustment +=
      Number(day.lop_value || 0) -
      Number(day.calculated_lop_value || 0);
  }

  totals.work_hours = Number(
    (totals.work_minutes / 60).toFixed(2)
  );

  totals.calculated_lop = Number(
    totals.calculated_lop.toFixed(2)
  );

  totals.lop_adjustment = Number(
    totals.lop_adjustment.toFixed(2)
  );

  totals.lop_value = Number(
    totals.lop_value.toFixed(2)
  );

  // 10. RESPONSE

  return {
    success: true,

    data: {
      employee: {
        id: employee.id,
        emp_code: employee.emp_code,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        designation: employee.designation,
        date_of_joining: employee.date_of_joining,
        status: employee.status,
      },

      month: validated.month,

      year: validated.year,

      totals,

      days,
    },
  };
}

// =====================================================
// ADMIN - ADJUST ATTENDANCE LOP
// =====================================================

async function adjustAttendanceLop({
  actorId,
  userId,
  workDate,
  newLop,
  reason,
}) {
  const validatedUserId = validateUserId(userId);

  const validatedDate = validateDate(workDate);

  // ===================================================
  // VALIDATE NEW LOP
  // ===================================================

  const lopValue = Number(newLop);

  if (
    !Number.isFinite(lopValue) ||
    lopValue < 0 ||
    lopValue > MAX_LOP_VALUE ||
    !Number.isInteger(lopValue / LOP_STEP)
  ) {
    throw new Error(
      "LOP must be between 0 and 2 in increments of 0.5"
    );
  }

  // ===================================================
  // VALIDATE REASON
  // ===================================================

  if (!reason || !String(reason).trim()) {
    throw new Error("Reason is required");
  }

  const cleanReason = String(reason).trim();

  // ===================================================
  // TRANSACTION
  // ===================================================

  return knex.transaction(async (trx) => {
    // LOCK AND VALIDATE ADMIN

    const actor = await trx("users")
      .where({
        id: actorId,
      })
      .forUpdate()
      .first();

    if (!actor) {
      throw new Error("Admin user not found");
    }

    if (actor.role !== "ADMIN") {
      throw new Error("Only admin can adjust attendance LOP");
    }

    // LOCK EMPLOYEE

    const employee = await trx("users")
      .select(
        "id",
        "emp_code",
        "name",
        "email",
        "role",
        "status"
      )
      .where({
        id: validatedUserId,
      })
      .forUpdate()
      .first();

    if (!employee) {
      throw new Error("Employee not found");
    }

    if (employee.role !== "EMPLOYEE") {
      throw new Error("Invalid employee");
    }

    // LOCK DAY SUMMARY

    const summary = await trx("day_summaries")
      .where({
        user_id: validatedUserId,
        work_date: validatedDate,
      })
      .forUpdate()
      .first();

    if (!summary) {
      throw new Error(
        "Attendance summary not found for this date"
      );
    }

    // CHECK MONTH LOCK

    if (summary.is_locked) {
      throw new Error("MONTH_LOCKED");
    }

    // ONLY ABSENT DAYS CAN BE ADJUSTED

    if (summary.status !== STATUS.ABSENT) {
      throw new Error(
        "LOP adjustment is allowed only for ABSENT days"
      );
    }

    // GET PREVIOUS LATEST ADJUSTMENT

    const previousAdjustment = await trx(
      "attendance_lop_adjustments"
    )
      .where({
        user_id: validatedUserId,
        work_date: validatedDate,
      })
      .orderBy("id", "desc")
      .first();

    const calculatedLop = Number(summary.lop_value || 0);

    const previousLop = previousAdjustment
      ? Number(previousAdjustment.new_lop)
      : calculatedLop;

    if (previousLop === lopValue) {
      throw new Error(
        "New LOP is the same as the current LOP"
      );
    }

    // =================================================
    // INSERT ADJUSTMENT HISTORY
    // =================================================

    const inserted = await trx(
      "attendance_lop_adjustments"
    )
      .insert({
        user_id: validatedUserId,
        work_date: validatedDate,
        previous_lop: previousLop,
        new_lop: lopValue,
        reason: cleanReason,
        created_by: actorId,
      })
      .returning("*");

    const adjustment = inserted[0];

    // =================================================
    // AUDIT LOG
    // =================================================

    await trx("audit_log").insert({
      actor_id: actorId,

      action: "ATTENDANCE_LOP_ADJUSTED",

      entity_type: "attendance_lop_adjustment",

      entity_id: adjustment.id,

      before: {
        calculated_lop: calculatedLop,
        previous_lop: previousLop,
      },

      after: {
        calculated_lop: calculatedLop,
        final_lop: lopValue,
        adjustment,
      },

      reason: cleanReason,
    });

    // =================================================
    // RESPONSE
    // =================================================

    return {
      success: true,

      message: "Attendance LOP adjusted successfully",

      data: {
        employee: {
          id: employee.id,
          emp_code: employee.emp_code,
          name: employee.name,
        },

        work_date: validatedDate,

        status: summary.status,

        calculated_lop: calculatedLop,

        previous_lop: previousLop,

        final_lop: lopValue,

        adjustment,
      },
    };
  });
}

// =====================================================
// ADMIN - ADD ATTENDANCE CORRECTION
// =====================================================

async function addAttendanceCorrection({
  actorId,
  userId,
  punchedAt,
  direction,
  reason,
}) {
  const validatedUserId = validateUserId(userId);

  if (!punchedAt) {
    throw new Error(
      "Punched date and time are required"
    );
  }

  if (
    direction !== DIRECTIONS.IN &&
    direction !== DIRECTIONS.OUT
  ) {
    throw new Error(
      "Direction must be IN or OUT"
    );
  }

  if (!reason || !String(reason).trim()) {
    throw new Error("Reason is required");
  }

  const actor = await knex("users")
    .where({
      id: actorId,
    })
    .first();

  if (!actor) {
    throw new Error("Admin user not found");
  }

  const employee = await getEmployee(validatedUserId);

  const punchedDate = new Date(punchedAt);

  if (Number.isNaN(punchedDate.getTime())) {
    throw new Error("Invalid punched_at");
  }

  const workDate = punchedDate.toISOString().slice(0, 10);

  return knex.transaction(async (trx) => {
    const summary = await trx("day_summaries")
      .where({
        user_id: validatedUserId,
        work_date: workDate,
      })
      .first();

    if (summary && summary.is_locked) {
      throw new Error("MONTH_LOCKED");
    }

    const inserted = await trx("correction_punches")
      .insert({
        user_id: validatedUserId,
        punched_at: punchedDate,
        direction,
        source: "ADMIN_MANUAL",
        regularization_id: null,
        created_by: actorId,
        reason: String(reason).trim(),
        is_voided: false,
      })
      .returning("*");

    const correction = inserted[0];

    await recomputeDay(
      validatedUserId,
      workDate,
      trx
    );

    const updatedSummary = await trx("day_summaries")
      .where({
        user_id: validatedUserId,
        work_date: workDate,
      })
      .first();

    await trx("audit_log").insert({
      actor_id: actorId,
      action: "CORRECTION_PUNCH_ADDED",
      entity_type: "correction_punch",
      entity_id: correction.id,
      before: null,
      after: {
        correction,
        day_summary: updatedSummary,
      },
      reason: String(reason).trim(),
    });

    await notifyUser(trx, {
      userId: validatedUserId,
      actorId,

      type: "ATTENDANCE_CORRECTION_ADDED",

      title: "Attendance Correction Added",

      message: `An admin has added a manual ${direction} attendance correction for ${workDate}.`,

      entityId: correction.id,

      data: {
        employee_id: employee.id,
        employee_name: employee.name,
        emp_code: employee.emp_code,
        work_date: workDate,
        correction_id: correction.id,
        punched_at: correction.punched_at,
        direction: correction.direction,
        source: correction.source,
        reason: correction.reason,
        created_by: actorId,
        created_by_name: actor.name,
      },
    });

    return {
      success: true,

      message: "Attendance correction added successfully",

      data: {
        correction,
        day_summary: updatedSummary,
      },
    };
  });
}

// =====================================================
// ADMIN - VOID ATTENDANCE CORRECTION
// =====================================================

async function voidAttendanceCorrection({
  actorId,
  correctionId,
  reason,
}) {
  if (
    correctionId === undefined ||
    correctionId === null ||
    correctionId === ""
  ) {
    throw new Error("Correction ID is required");
  }

  const parsedCorrectionId = Number(correctionId);

  if (
    !Number.isInteger(parsedCorrectionId) ||
    parsedCorrectionId <= 0
  ) {
    throw new Error("Invalid correction ID");
  }

  if (!reason || !String(reason).trim()) {
    throw new Error("Reason is required");
  }

  const cleanReason = String(reason).trim();

  const actor = await knex("users")
    .where({
      id: actorId,
    })
    .first();

  if (!actor) {
    throw new Error("Admin user not found");
  }

  return knex.transaction(async (trx) => {
    const correction = await trx("correction_punches")
      .where({
        id: parsedCorrectionId,
      })
      .forUpdate()
      .first();

    if (!correction) {
      throw new Error("Correction not found");
    }

    if (correction.is_voided) {
      throw new Error("Correction already voided");
    }

    const punchedDate = new Date(
      correction.punched_at
    );

    if (Number.isNaN(punchedDate.getTime())) {
      throw new Error("Invalid correction punched_at");
    }

    const workDate = punchedDate.toISOString().slice(0, 10);

    const existingSummary = await trx("day_summaries")
      .where({
        user_id: correction.user_id,
        work_date: workDate,
      })
      .first();

    if (
      existingSummary &&
      existingSummary.is_locked
    ) {
      throw new Error("MONTH_LOCKED");
    }

    const employee = await getEmployee(
      correction.user_id,
      trx
    );

    const beforeCorrection = {
      ...correction,
    };

    await trx("correction_punches")
      .where({
        id: parsedCorrectionId,
      })
      .update({
        is_voided: true,
      });

    const updatedCorrection = await trx("correction_punches")
      .where({
        id: parsedCorrectionId,
      })
      .first();

    await recomputeDay(
      correction.user_id,
      workDate,
      trx
    );

    const updatedSummary = await trx("day_summaries")
      .where({
        user_id: correction.user_id,
        work_date: workDate,
      })
      .first();

    await trx("audit_log").insert({
      actor_id: actorId,
      action: "CORRECTION_PUNCH_VOIDED",
      entity_type: "correction_punch",
      entity_id: parsedCorrectionId,

      before: beforeCorrection,

      after: {
        correction: updatedCorrection,
        day_summary: updatedSummary,
      },

      reason: cleanReason,
    });

    await notifyUser(trx, {
      userId: correction.user_id,
      actorId,

      type: "ATTENDANCE_CORRECTION_VOIDED",

      title: "Attendance Correction Voided",

      message: `An admin has voided your ${correction.direction} attendance correction for ${workDate}.`,

      entityId: parsedCorrectionId,

      data: {
        employee_id: employee.id,
        employee_name: employee.name,
        emp_code: employee.emp_code,
        work_date: workDate,
        correction_id: parsedCorrectionId,
        punched_at: correction.punched_at,
        direction: correction.direction,
        source: correction.source,
        original_reason: correction.reason,
        void_reason: cleanReason,
        created_by: correction.created_by,
        voided_by: actorId,
        voided_by_name: actor.name,
        is_voided: true,
      },
    });

    return {
      success: true,

      message: "Attendance correction voided successfully",

      data: {
        correction: updatedCorrection,
        day_summary: updatedSummary,
      },
    };
  });
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  recomputeDay,

  getMyAttendance,
  getMyAttendanceDay,

  getAdminDailyAttendance,
  getAdminMonthlyAttendance,

  adjustAttendanceLop,

  addAttendanceCorrection,
  voidAttendanceCorrection,
getFinalLopValue,
  getLatestLopAdjustments,
};