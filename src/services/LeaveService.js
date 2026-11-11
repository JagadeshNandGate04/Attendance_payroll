const knex = require("../config/database");
const formatDateOnly = require("../utils/dateHelpers").formatDateOnly;

const MONTHLY_LEAVE_LIMIT = 3;
const APP_TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

function getLocalDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function calculateWorkingDaysByMonth(fromDate, toDate, weeklyOffDays, holidayDates = []) {
  const holidaySet = new Set(holidayDates);
  const result = {};
  const current = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  while (current <= end) {
    const dateString = current.toISOString().slice(0, 10);
    const monthKey = dateString.slice(0, 7);
    const isWeeklyOff = weeklyOffDays.includes(current.getUTCDay());
    const isHoliday = holidaySet.has(dateString);

    if (!isWeeklyOff && !isHoliday) {
      result[monthKey] = (result[monthKey] || 0) + 1;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

async function getWeeklyOffDays(trx) {
  const setting = await trx("settings")
    .where({ key: "weekly_off_days" })
    .first();

  let days = setting?.value;

  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch (error) {
      days = null;
    }
  }

  return Array.isArray(days) ? days.map(Number) : [0, 6];
}

// async function getMonthlyLeaveUsage(trx, userId, {
//   excludeRequestId = null,
//   weeklyOffDays = [0, 6]
// } = {}) {
//   const usage = {};

//   // Approved leave is represented by LEAVE day summaries on the actual leave dates.
//   const approved = await trx("day_summaries")
//     .select(
//       trx.raw("TO_CHAR(work_date, 'YYYY-MM') AS month"),
//       trx.raw("COUNT(*)::int AS days")
//     )
//     .where({ user_id: userId, status: "LEAVE" })
//     .groupByRaw("TO_CHAR(work_date, 'YYYY-MM')");

//   for (const row of approved) {
//     usage[row.month] = Number(row.days || 0);
//   }

//   // Pending requests reserve days in the calendar month(s) in which leave is taken.
//   let pendingQuery = trx("leave_requests")
//     .select(
//       "id",
//       trx.raw("from_date::text AS from_date"),
//       trx.raw("to_date::text AS to_date")
//     )
//     .where({ user_id: userId, status: "PENDING" });

//   if (excludeRequestId !== null) {
//     pendingQuery = pendingQuery.whereNot("id", excludeRequestId);
//   }

//   const pendingRequests = await pendingQuery;

//   for (const request of pendingRequests) {
//     const holidays = await trx("holidays")
//       .select(trx.raw("holiday_date::text AS holiday_date"))
//       .whereBetween("holiday_date", [request.from_date, request.to_date]);

//     const breakdown = calculateWorkingDaysByMonth(
//       request.from_date,
//       request.to_date,
//       weeklyOffDays,
//       holidays.map((item) => item.holiday_date)
//     );

//     for (const [month, days] of Object.entries(breakdown)) {
//       usage[month] = (usage[month] || 0) + days;
//     }
//   }

//   return usage;
// }


async function getMonthlyLeaveUsage(trx, userId, {
  excludeRequestId = null,
  weeklyOffDays = [0, 6]
} = {}) {
  const usage = {};

  // Count both approved and pending leave requests.
  const query = trx("leave_requests")
    .select(
      "id",
      trx.raw("from_date::text AS from_date"),
      trx.raw("to_date::text AS to_date")
    )
    .where({ user_id: userId })
    .whereIn("status", ["APPROVED", "PENDING"]);

  if (excludeRequestId !== null) {
    query.whereNot("id", excludeRequestId);
  }

  const requests = await query;

  for (const request of requests) {
    const holidays = await trx("holidays")
      .select(trx.raw("holiday_date::text AS holiday_date"))
      .whereBetween("holiday_date", [
        request.from_date,
        request.to_date
      ]);

    const breakdown = calculateWorkingDaysByMonth(
      request.from_date,
      request.to_date,
      weeklyOffDays,
      holidays.map((item) => item.holiday_date)
    );

    for (const [month, days] of Object.entries(breakdown)) {
      usage[month] = (usage[month] || 0) + days;
    }
  }

  return usage;
}



function validateMonthlyLeaveLimit(existingUsage, requestedBreakdown) {
  const exceeded = [];

  for (const [month, requestedDays] of Object.entries(requestedBreakdown)) {
    const alreadyUsedOrReserved = Number(existingUsage[month] || 0);
    const total = alreadyUsedOrReserved + Number(requestedDays || 0);

    if (total > MONTHLY_LEAVE_LIMIT) {
      exceeded.push({
        month,
        already_used_or_pending: alreadyUsedOrReserved,
        requested_days: requestedDays,
        monthly_limit: MONTHLY_LEAVE_LIMIT,
        exceeds_by: total - MONTHLY_LEAVE_LIMIT
      });
    }
  }

  if (exceeded.length) {
    const error = new Error(
      `Employees can take a maximum of ${MONTHLY_LEAVE_LIMIT} leave days per calendar month`
    );
    error.code = "MONTHLY_LEAVE_LIMIT_EXCEEDED";
    error.monthlyUsage = exceeded;
    throw error;
  }
}

// NOTIFICATION HELPERS

// Notify all active Admin users
async function notifyAdmins(trx, {
  actorId,
  type,
  title,
  message,
  entityType,
  entityId,
  data = {}
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
      entity_type: entityType,
      entity_id: entityId,
      data
    }))
  );
}

// Notify one specific employee
async function notifyUser(trx, {
  userId,
  actorId,
  type,
  title,
  message,
  entityType,
  entityId,
  data = {}
}) {
  await trx("notifications").insert({
    user_id: userId,
    actor_id: actorId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    data
  });
}

// GET EMPLOYEE LEAVE BALANCE

async function getMyLeaveBalance({ userId }) {
  const ledger = await knex("leave_ledger")
    .sum({ balance: "delta" })
    .where({ user_id: userId })
    .first();

  const balance = Number(ledger?.balance ?? 0);
  const today = getLocalDateString();
  const startDate = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number);
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const endDate = nextMonthDate.toISOString().slice(0, 10);

  const consumed = await knex("day_summaries")
    .count({ days: "*" })
    .where({ user_id: userId, status: "LEAVE" })
    .where("work_date", ">=", startDate)
    .where("work_date", "<", endDate)
    .first();

  const pending = await knex("leave_requests")
    .sum({ days: "days" })
    .where({ user_id: userId, status: "PENDING" })
    .first();

  const pendingDays = Number(pending?.days ?? 0);

  return {
    success: true,
    data: {
      available_balance: balance - pendingDays,
      total_balance: balance,
      consumed_this_month: Number(consumed?.days ?? 0),
      pending_days: pendingDays,
      monthly_leave_limit: MONTHLY_LEAVE_LIMIT,
      monthly_leave_used: Number(consumed?.days ?? 0)
    }
  };
}

// LEAVE APPLY FOR EMPLOYEE

// async function applyMyLeave({
//   userId,
//   fromDate,
//   toDate,
//   reason
// }) {
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

//   const normalizedFromDate = formatDateOnly(fromDate);
//   const normalizedToDate = formatDateOnly(toDate);
//   const from = new Date(`${normalizedFromDate}T00:00:00Z`);
//   const to = new Date(`${normalizedToDate}T00:00:00Z`);

//   if (
//     Number.isNaN(from.getTime()) ||
//     Number.isNaN(to.getTime()) ||
//     from > to
//   ) {
//     const error = new Error("Invalid from_date or to_date");
//     error.code = "INVALID_DATE_RANGE";
//     throw error;
//   }

//   const weeklyOffDays = await getWeeklyOffDays(knex);
//   const holidays = await knex("holidays")
//     .select(
//       knex.raw("holiday_date::text as holiday_date"),
//       "name"
//     )
//     .whereBetween("holiday_date", [normalizedFromDate, normalizedToDate]);

//   const holidaySet = new Set(holidays.map((holiday) => holiday.holiday_date));
//   const holidayNames = new Map(
//     holidays.map((holiday) => [holiday.holiday_date, holiday.name])
//   );

//   let days = 0;
//   const excludedDates = [];
//   const current = new Date(from);

//   while (current <= to) {
//     const dateString = current.toISOString().slice(0, 10);
//     const isWeeklyOff = weeklyOffDays.includes(current.getUTCDay());
//     const isHoliday = holidaySet.has(dateString);

//     if (isWeeklyOff) {
//       excludedDates.push({ date: dateString, type: "WEEKLY_OFF" });
//     } else if (isHoliday) {
//       excludedDates.push({
//         date: dateString,
//         type: "HOLIDAY",
//         name: holidayNames.get(dateString) || null
//       });
//     } else {
//       days += 1;
//     }

//     current.setUTCDate(current.getUTCDate() + 1);
//   }

//   if (days <= 0) {
//     const error = new Error("Selected dates contain no working days");
//     error.code = "NO_LEAVE_DAYS";
//     error.excludedDates = excludedDates;
//     throw error;
//   }

//   const requestedBreakdown = calculateWorkingDaysByMonth(
//     normalizedFromDate,
//     normalizedToDate,
//     weeklyOffDays,
//     [...holidaySet]
//   );

//   const isRetroactive = normalizedFromDate < getLocalDateString();

//   const transactionResult = await knex.transaction(async (trx) => {
//     const employee = await trx("users")
//       .select("id", "name", "emp_code")
//       .where({ id: userId })
//       .forUpdate()
//       .first();

//     if (!employee) {
//       const error = new Error("Employee not found");
//       error.code = "EMPLOYEE_NOT_FOUND";
//       throw error;
//     }

//     const ledger = await trx("leave_ledger")
//       .sum({ balance: "delta" })
//       .where({ user_id: userId })
//       .first();

//     const balance = Number(ledger?.balance ?? 0);

//     const pending = await trx("leave_requests")
//       .sum({ days: "days" })
//       .where({ user_id: userId, status: "PENDING" })
//       .first();

//     const pendingDays = Number(pending?.days ?? 0);
//     const availableBalance = balance - pendingDays;

//     if (availableBalance < days) {
//       const error = new Error("Insufficient leave balance");
//       error.code = "INSUFFICIENT_BALANCE";
//       error.availableBalance = availableBalance;
//       error.requestedDays = days;
//       throw error;
//     }

//     const monthlyUsage = await getMonthlyLeaveUsage(trx, userId, {
//       weeklyOffDays
//     });
//     validateMonthlyLeaveLimit(monthlyUsage, requestedBreakdown);

//     const [request] = await trx("leave_requests")
//       .insert({
//         user_id: userId,
//         from_date: normalizedFromDate,
//         to_date: normalizedToDate,
//         days,
//         reason: String(reason).trim(),
//         is_retroactive: isRetroactive,
//         status: "PENDING"
//       })
//       .returning([
//         "id",
//         "user_id",
//         "from_date",
//         "to_date",
//         "days",
//         "reason",
//         "is_retroactive",
//         "status",
//         "created_at"
//       ]);

//     await notifyAdmins(trx, {
//       actorId: userId,
//       type: "LEAVE_REQUEST",
//       title: "New Leave Request",
//       message: `${employee.name || "An employee"} submitted a leave request for ${days} day(s).`,
//       entityType: "leave_request",
//       entityId: request.id,
//       data: {
//         employee_id: userId,
//         employee_name: employee.name || null,
//         emp_code: employee.emp_code || null,
//         from_date: normalizedFromDate,
//         to_date: normalizedToDate,
//         days
//       }
//     });

//     return { request, balance, pendingDays, availableBalance };
//   });

//   return {
//     success: true,
//     message: "Leave request submitted successfully",
//     data: {
//       leave_request: transactionResult.request,
//       balance: {
//         current: transactionResult.balance,
//         pending_reserved: transactionResult.pendingDays,
//         available_after_reservation: transactionResult.availableBalance - days
//       },
//       leave_calculation: {
//         requested_from: normalizedFromDate,
//         requested_to: normalizedToDate,
//         leave_days: days,
//         monthly_breakdown: requestedBreakdown,
//         excluded_dates: excludedDates
//       }
//     }
//   };
// }



async function applyMyLeave({
  userId,
  fromDate,
  toDate,
  reason
}) {
  // BASIC VALIDATION
 

  if (!fromDate || !toDate) {
    const error = new Error(
      "from_date and to_date are required"
    );
    error.code = "INVALID_DATE_RANGE";
    throw error;
  }

  if (!reason || !String(reason).trim()) {
    const error = new Error("Leave reason is required");
    error.code = "INVALID_REASON";
    throw error;
  }

  const normalizedFromDate = formatDateOnly(fromDate);
  const normalizedToDate = formatDateOnly(toDate);

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (
    !datePattern.test(normalizedFromDate) ||
    !datePattern.test(normalizedToDate)
  ) {
    const error = new Error("Invalid date format");
    error.code = "INVALID_DATE_RANGE";
    throw error;
  }

  const from = new Date(`${normalizedFromDate}T00:00:00Z`);
  const to = new Date(`${normalizedToDate}T00:00:00Z`);

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from.toISOString().slice(0, 10) !== normalizedFromDate ||
    to.toISOString().slice(0, 10) !== normalizedToDate ||
    from > to
  ) {
    const error = new Error(
      "Invalid from_date or to_date"
    );
    error.code = "INVALID_DATE_RANGE";
    throw error;
  }

  
  // GET WEEKLY OFF DAYS AND HOLIDAYS
  

  const weeklyOffDays = await getWeeklyOffDays(knex);

  const holidays = await knex("holidays")
    .select(
      knex.raw("holiday_date::text AS holiday_date"),
      "name"
    )
    .whereBetween("holiday_date", [
      normalizedFromDate,
      normalizedToDate
    ]);

  const holidaySet = new Set(
    holidays.map((holiday) => holiday.holiday_date)
  );

  const holidayNames = new Map(
    holidays.map((holiday) => [
      holiday.holiday_date,
      holiday.name
    ])
  );

  
  // CALCULATE WORKING DAYS
  

  let days = 0;

  const excludedDates = [];

  const current = new Date(from);

  while (current <= to) {
    const dateString = current.toISOString().slice(0, 10);

    const dayOfWeek = current.getUTCDay();

    const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
    const isHoliday = holidaySet.has(dateString);

    if (isWeeklyOff) {
      excludedDates.push({
        date: dateString,
        type: "WEEKLY_OFF"
      });
    } else if (isHoliday) {
      excludedDates.push({
        date: dateString,
        type: "HOLIDAY",
        name: holidayNames.get(dateString) || null
      });
    } else {
      days += 1;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (days <= 0) {
    const error = new Error(
      "Selected dates contain no working days"
    );

    error.code = "NO_LEAVE_DAYS";
    error.excludedDates = excludedDates;

    throw error;
  }

  
  // MONTHLY BREAKDOWN
  

  const requestedBreakdown = calculateWorkingDaysByMonth(
    normalizedFromDate,
    normalizedToDate,
    weeklyOffDays,
    [...holidaySet]
  );

  const isRetroactive =
    normalizedFromDate < getLocalDateString();

 
  // DATABASE TRANSACTION
  

  const transactionResult = await knex.transaction(
    async (trx) => {

      // Lock employee to prevent concurrent applications.
      const employee = await trx("users")
        .select("id", "name", "emp_code")
        .where({ id: userId })
        .forUpdate()
        .first();

      if (!employee) {
        const error = new Error("Employee not found");
        error.code = "EMPLOYEE_NOT_FOUND";
        throw error;
      }

      
      // CHECK OVERLAPPING LEAVE REQUESTS
      

      const overlappingRequest = await trx("leave_requests")
        .select(
          "id",
          "from_date",
          "to_date",
          "status"
        )
        .where({ user_id: userId })
        .whereIn("status", ["PENDING", "APPROVED"])
        .where("from_date", "<=", normalizedToDate)
        .where("to_date", ">=", normalizedFromDate)
        .first();

      if (overlappingRequest) {
        const error = new Error(
          "You already have a pending or approved leave request for overlapping dates"
        );

        error.code = "LEAVE_DATE_CONFLICT";

        error.conflictingRequest = {
          id: overlappingRequest.id,
          from_date: formatDateOnly(
            overlappingRequest.from_date
          ),
          to_date: formatDateOnly(
            overlappingRequest.to_date
          ),
          status: overlappingRequest.status
        };

        throw error;
      }

      
      // CHECK TOTAL LEAVE BALANCE
      

      const ledger = await trx("leave_ledger")
        .sum({ balance: "delta" })
        .where({ user_id: userId })
        .first();

      const balance = Number(ledger?.balance ?? 0);

      // Reserve all other pending requests.
      const pending = await trx("leave_requests")
        .sum({ days: "days" })
        .where({
          user_id: userId,
          status: "PENDING"
        })
        .first();

      const pendingDays = Number(
        pending?.days ?? 0
      );

      const availableBalance = balance - pendingDays;

      if (availableBalance < days) {
        const error = new Error(
          "Insufficient leave balance"
        );

        error.code = "INSUFFICIENT_BALANCE";
        error.availableBalance = availableBalance;
        error.requestedDays = days;

        throw error;
      }

     
      // CHECK MONTHLY LEAVE LIMIT
      

      const monthlyUsage = await getMonthlyLeaveUsage(
        trx,
        userId,
        {
          weeklyOffDays
        }
      );

      validateMonthlyLeaveLimit(
        monthlyUsage,
        requestedBreakdown
      );

      
      // INSERT LEAVE REQUEST
      

      const [request] = await trx("leave_requests")
        .insert({
          user_id: userId,
          from_date: normalizedFromDate,
          to_date: normalizedToDate,
          days,
          reason: String(reason).trim(),
          is_retroactive: isRetroactive,
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

      
      // NOTIFY ADMINS
      

      await notifyAdmins(trx, {
        actorId: userId,
        type: "LEAVE_REQUEST",
        title: "New Leave Request",
        message:
          `${employee.name || "An employee"} submitted a leave request for ${days} day(s).`,
        entityType: "leave_request",
        entityId: request.id,
        data: {
          employee_id: userId,
          employee_name: employee.name || null,
          emp_code: employee.emp_code || null,
          from_date: normalizedFromDate,
          to_date: normalizedToDate,
          days
        }
      });

      return {
        request,
        balance,
        pendingDays,
        availableBalance
      };
    }
  );

  // RESPONSE

  return {
    success: true,
    message: "Leave request submitted successfully",
    data: {
      leave_request: transactionResult.request,

      balance: {
        current: transactionResult.balance,
        pending_reserved: transactionResult.pendingDays,
        available_after_reservation:
          transactionResult.availableBalance - days
      },

      leave_calculation: {
        requested_from: normalizedFromDate,
        requested_to: normalizedToDate,
        leave_days: days,
        monthly_breakdown: requestedBreakdown,
        excluded_dates: excludedDates
      }
    }
  };
}



// CANCEL LEAVE REQUEST FOR EMPLOYEE

async function cancelMyLeave({
  userId,
  leaveRequestId
}) {
  if (
    !leaveRequestId ||
    !Number.isInteger(Number(leaveRequestId))
  ) {
    const error = new Error("Invalid leave request ID");
    error.code = "INVALID_LEAVE_ID";
    throw error;
  }

  const id = Number(leaveRequestId);

  const leaveRequest = await knex("leave_requests")
    .where({
      id,
      user_id: userId
    })
    .first();

  if (!leaveRequest) {
    const error = new Error("Leave request not found");
    error.code = "LEAVE_NOT_FOUND";
    throw error;
  }

  if (leaveRequest.status !== "PENDING") {
    const error = new Error(
      `Leave request cannot be cancelled because its current status is ${leaveRequest.status}`
    );

    error.code = "LEAVE_NOT_CANCELLABLE";
    error.status = leaveRequest.status;
    throw error;
  }

  const [cancelledRequest] = await knex("leave_requests")
    .where({
      id,
      user_id: userId,
      status: "PENDING"
    })
    .update({
      status: "CANCELLED",
      updated_at: knex.fn.now()
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
      "updated_at"
    ]);

  return {
    success: true,
    message: "Leave request cancelled successfully",
    data: {
      leave_request: cancelledRequest
    }
  };
}

// =====================================================
// GET EMPLOYEE'S OWN LEAVE REQUESTS
// =====================================================

async function getMyLeaveRequests({
  userId,
  month,
  year
}) {

  // ---------------------------------------------------
  // DEFAULT MONTH AND YEAR
  // ---------------------------------------------------

  const today = getLocalDateString();

  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  const selectedMonth =
    month === undefined || month === ""
      ? currentMonth
      : Number(month);

  const selectedYear =
    year === undefined || year === ""
      ? currentYear
      : Number(year);

  // ---------------------------------------------------
  // VALIDATE MONTH
  // ---------------------------------------------------

  if (
    !Number.isInteger(selectedMonth) ||
    selectedMonth < 1 ||
    selectedMonth > 12
  ) {
    const error = new Error(
      "Month must be between 1 and 12"
    );

    error.code = "INVALID_MONTH";
    throw error;
  }

  // ---------------------------------------------------
  // VALIDATE YEAR
  // ---------------------------------------------------

  if (
    !Number.isInteger(selectedYear) ||
    selectedYear < 2000 ||
    selectedYear > 2100
  ) {
    const error = new Error(
      "Invalid year"
    );

    error.code = "INVALID_YEAR";
    throw error;
  }

  // ---------------------------------------------------
  // CALCULATE SELECTED MONTH DATE RANGE
  // ---------------------------------------------------

  const monthStart =
    `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;

  const nextMonth = new Date(
    Date.UTC(selectedYear, selectedMonth, 1)
  );

  const monthEndExclusive =
    nextMonth.toISOString().slice(0, 10);

  // ---------------------------------------------------
  // FETCH EMPLOYEE LEAVE REQUESTS
  // ---------------------------------------------------

  const leaveRequests = await knex("leave_requests")
    .select(
      "id",
      "user_id",
      knex.raw("from_date::text AS from_date"),
      knex.raw("to_date::text AS to_date"),
      "days",
      "reason",
      "is_retroactive",
      "status",
      "created_at",
      "updated_at"
    )
    .where("user_id", userId)

    // Include requests overlapping the selected month.
    .where("from_date", "<", monthEndExclusive)
    .where("to_date", ">=", monthStart)

    .orderBy("from_date", "desc")
    .orderBy("id", "desc");

  // ---------------------------------------------------
  // RESPONSE
  // ---------------------------------------------------

  return {
    success: true,
    data: {
      filter: {
        month: selectedMonth,
        year: selectedYear,
        month_start: monthStart,
        month_end: new Date(
          Date.UTC(selectedYear, selectedMonth, 0)
        ).toISOString().slice(0, 10)
      },

      total_requests: leaveRequests.length,

      leave_requests: leaveRequests
    }
  };
}

// GET ADMIN LEAVE REQUESTS

async function getAdminLeaveRequests({
  status,
  month,
  year
}) {
  const validStatuses = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "CANCELLED"
  ];

  if (
    status &&
    !validStatuses.includes(String(status).toUpperCase())
  ) {
    const error = new Error("Invalid leave request status");
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
      "u.emp_code",
      "u.name as employee_name",
      "u.email as employee_email",
      "u.phone as employee_phone",
      "u.designation"
    );

  if (status) {
    query.where(
      "lr.status",
      String(status).toUpperCase()
    );
  }

  if (month) {
    const monthNumber = Number(month);

    query.whereRaw(
      "EXTRACT(MONTH FROM lr.from_date) = ?",
      [monthNumber]
    );
  }

  if (year) {
    const yearNumber = Number(year);

    query.whereRaw(
      "EXTRACT(YEAR FROM lr.from_date) = ?",
      [yearNumber]
    );
  }

  query.orderBy("lr.created_at", "desc");

  const requests = await query;

  return {
    success: true,
    data: {
      requests
    },
    count: requests.length
  };
}

// ADMIN DECIDE LEAVE REQUEST

async function decideAdminLeave({
  adminId,
  leaveRequestId,
  action,
  note
}) {
  if (
    !leaveRequestId ||
    !Number.isInteger(Number(leaveRequestId))
  ) {
    const error = new Error("Invalid leave request ID");
    error.code = "INVALID_LEAVE_ID";
    throw error;
  }

  const id = Number(leaveRequestId);

  const normalizedAction = String(action || "")
    .trim()
    .toUpperCase();

  if (!["APPROVE", "REJECT"].includes(normalizedAction)) {
    const error = new Error(
      "Action must be APPROVE or REJECT"
    );
    error.code = "INVALID_ACTION";
    throw error;
  }

  if (!note || !String(note).trim()) {
    const error = new Error("Decision note is required");
    error.code = "INVALID_NOTE";
    throw error;
  }

  const result = await knex.transaction(async (trx) => {
    const leaveRequest = await trx("leave_requests")
      .where({ id })
      .forUpdate()
      .first();

    if (!leaveRequest) {
      const error = new Error("Leave request not found");
      error.code = "LEAVE_NOT_FOUND";
      throw error;
    }

    if (leaveRequest.status !== "PENDING") {
      const error = new Error(
        `Leave request cannot be decided because its current status is ${leaveRequest.status}`
      );

      error.code = "LEAVE_NOT_DECIDABLE";
      error.status = leaveRequest.status;
      throw error;
    }

    const fromDate = formatDateOnly(leaveRequest.from_date);
    const toDate = formatDateOnly(leaveRequest.to_date);

    // APPROVE

    if (normalizedAction === "APPROVE") {
      // Lock employee row to prevent concurrent leave applications.
      await trx("users")
        .where({ id: leaveRequest.user_id })
        .forUpdate()
        .first("id");

      const ledger = await trx("leave_ledger")
        .sum({ balance: "delta" })
        .where({ user_id: leaveRequest.user_id })
        .first();

      const balance = Number(ledger?.balance ?? 0);

      const pending = await trx("leave_requests")
        .sum({ days: "days" })
        .where({
          user_id: leaveRequest.user_id,
          status: "PENDING"
        })
        .whereNot("id", id)
        .first();

      const otherPendingDays = Number(pending?.days ?? 0);
      const availableBalance = balance - otherPendingDays;
      const requestedDays = Number(leaveRequest.days);

      if (availableBalance < requestedDays) {
        const error = new Error("Insufficient leave balance");
        error.code = "INSUFFICIENT_BALANCE";
        error.availableBalance = availableBalance;
        error.requestedDays = requestedDays;
        throw error;
      }

      const holidays = await trx("holidays")
        .select(
          trx.raw("holiday_date::text as holiday_date")
        )
        .whereBetween("holiday_date", [fromDate, toDate]);

      const holidaySet = new Set(
        holidays.map((holiday) => holiday.holiday_date)
      );

      const weeklyOffSetting = await trx("settings")
        .where({ key: "weekly_off_days" })
        .first();

      let weeklyOffDays = weeklyOffSetting?.value;

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

      weeklyOffDays = weeklyOffDays.map(Number);

      // Check the 3-day monthly limit using actual leave dates.
      const requestedBreakdown = calculateWorkingDaysByMonth(
        fromDate,
        toDate,
        weeklyOffDays,
        holidays.map((holiday) => holiday.holiday_date)
      );

      const monthlyUsage = await getMonthlyLeaveUsage(
        trx,
        leaveRequest.user_id,
        {
          excludeRequestId: id,
          weeklyOffDays
        }
      );

      validateMonthlyLeaveLimit(
        monthlyUsage,
        requestedBreakdown
      );

      const from = new Date(`${fromDate}T00:00:00Z`);
      const to = new Date(`${toDate}T00:00:00Z`);
      const checkDate = new Date(`${fromDate}T00:00:00Z`);

      // Check payroll locks.
      while (checkDate <= to) {
        const dateString = checkDate.toISOString().slice(0, 10);
        const dayOfWeek = checkDate.getUTCDay();

        const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
        const isHoliday = holidaySet.has(dateString);

        if (!isWeeklyOff && !isHoliday) {
          const summary = await trx("day_summaries")
            .where({
              user_id: leaveRequest.user_id,
              work_date: dateString
            })
            .forUpdate()
            .first();

          if (summary?.is_locked) {
            const error = new Error(
              `Leave cannot be approved because ${dateString} is locked`
            );

            error.code = "MONTH_LOCKED";
            error.lockedDate = dateString;
            throw error;
          }
        }

        checkDate.setUTCDate(checkDate.getUTCDate() + 1);
      }

      const [updatedRequest] = await trx("leave_requests")
        .where({ id })
        .update({
          status: "APPROVED",
          decided_by: adminId,
          decided_at: trx.fn.now(),
          decision_note: String(note).trim(),
          updated_at: trx.fn.now()
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
          "updated_at"
        ]);

      const [ledgerEntry] = await trx("leave_ledger")
        .insert({
          user_id: leaveRequest.user_id,
          entry_date: fromDate,
          delta: -requestedDays,
          type: "CONSUMED",
          leave_request_id: id,
          note: `Leave consumed for request #${id}`
        })
        .returning([
          "id",
          "user_id",
          "entry_date",
          "delta",
          "type",
          "leave_request_id",
          "note",
          "created_at"
        ]);

      // Update day summaries.
      const currentDay = new Date(`${fromDate}T00:00:00Z`);

      while (currentDay <= to) {
        const dateString = currentDay.toISOString().slice(0, 10);
        const dayOfWeek = currentDay.getUTCDay();

        const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
        const isHoliday = holidaySet.has(dateString);

        if (!isWeeklyOff && !isHoliday) {
          const summary = await trx("day_summaries")
            .where({
              user_id: leaveRequest.user_id,
              work_date: dateString
            })
            .forUpdate()
            .first();

          if (summary) {
            await trx("day_summaries")
              .where({ id: summary.id })
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
                updated_at: trx.fn.now()
              });
          } else {
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
              updated_at: trx.fn.now()
            });
          }
        }

        currentDay.setUTCDate(currentDay.getUTCDate() + 1);
      }

      const [audit] = await trx("audit_log")
        .insert({
          actor_id: adminId,
          action: "LEAVE_APPROVED",
          entity_type: "leave_request",
          entity_id: id,
          before: leaveRequest,
          after: updatedRequest,
          reason: String(note).trim()
        })
        .returning([
          "id",
          "actor_id",
          "action",
          "entity_type",
          "entity_id",
          "reason",
          "created_at"
        ]);

      await notifyUser(trx, {
        userId: leaveRequest.user_id,
        actorId: adminId,
        type: "LEAVE_APPROVED",
        title: "Leave Request Approved",
        message: `Your leave request from ${fromDate} to ${toDate} has been approved.`,
        entityType: "leave_request",
        entityId: id,
        data: {
          status: "APPROVED",
          from_date: fromDate,
          to_date: toDate,
          days: requestedDays,
          decision_note: String(note).trim()
        }
      });

      return {
        action: "APPROVE",
        leaveRequest: updatedRequest,
        ledgerEntry,
        audit
      };
    }

    // REJECT

    const [updatedRequest] = await trx("leave_requests")
      .where({ id })
      .update({
        status: "REJECTED",
        decided_by: adminId,
        decided_at: trx.fn.now(),
        decision_note: String(note).trim(),
        updated_at: trx.fn.now()
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
        "updated_at"
      ]);

    const [audit] = await trx("audit_log")
      .insert({
        actor_id: adminId,
        action: "LEAVE_REJECTED",
        entity_type: "leave_request",
        entity_id: id,
        before: leaveRequest,
        after: updatedRequest,
        reason: String(note).trim()
      })
      .returning([
        "id",
        "actor_id",
        "action",
        "entity_type",
        "entity_id",
        "reason",
        "created_at"
      ]);

    await notifyUser(trx, {
      userId: leaveRequest.user_id,
      actorId: adminId,
      type: "LEAVE_REJECTED",
      title: "Leave Request Rejected",
      message: `Your leave request from ${fromDate} to ${toDate} has been rejected.`,
      entityType: "leave_request",
      entityId: id,
      data: {
        status: "REJECTED",
        from_date: fromDate,
        to_date: toDate,
        days: Number(leaveRequest.days),
        decision_note: String(note).trim()
      }
    });

    return {
      action: "REJECT",
      leaveRequest: updatedRequest,
      audit
    };
  });

  return {
    success: true,
    message:
      result.action === "APPROVE"
        ? "Leave request approved successfully"
        : "Leave request rejected successfully",
    data: result
  };
}

// EXPORTS

module.exports = {
  getMyLeaveBalance,
  applyMyLeave,
  cancelMyLeave,
  getMyLeaveRequests,
  getAdminLeaveRequests,
  decideAdminLeave,
  notifyAdmins,
  notifyUser
};