const knex = require("../config/database");
const attendanceService = require("./AttendanceService");
const leaveService = require("./LeaveService");
const notificationService = require("./NotificationService");
const { applyHolidayEmployeeScope } = require("../utils/holidayUtils");
const { validateMonthYear } = require("../utils/attendanceUtils");

const APP_TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

function getLocalDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return values;
}

function getMonthDates(year, month) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const endExclusive = nextMonth.toISOString().slice(0, 10);
  const lastDate = new Date(`${endExclusive}T00:00:00.000Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() - 1);

  return {
    startDate,
    endExclusive,
    endDate: lastDate.toISOString().slice(0, 10),
  };
}

function getCalendarPeriod(month, year) {
  if (month === undefined && year === undefined) {
    const today = getLocalDateParts();
    return {
      month: Number(today.month),
      year: Number(today.year),
    };
  }

  return validateMonthYear(month, year);
}

async function buildEmployeeCalendar({
  userId,
  empCode,
  month,
  year,
  attendance: existingAttendance,
}) {
  const period = validateMonthYear(month, year);
  month = period.month;
  year = period.year;
  const { startDate, endExclusive, endDate } = getMonthDates(year, month);

  const [attendance, holidays, leaveRequests, workdaySwaps] =
    await Promise.all([
      existingAttendance ||
        attendanceService.getMyAttendance({
          userId,
          empCode,
          month,
          year,
        }),
      applyHolidayEmployeeScope(knex("holidays"), userId, knex)
        .select(
          "holidays.id",
          knex.raw("holidays.holiday_date::text AS date"),
          "holidays.name",
          "holidays.is_all_employees"
        )
        .where("holidays.holiday_date", ">=", startDate)
        .where("holidays.holiday_date", "<", endExclusive)
        .orderBy("holidays.holiday_date", "asc"),
      knex("leave_requests")
        .select(
          "id",
          knex.raw("from_date::text AS from_date"),
          knex.raw("to_date::text AS to_date"),
          "days",
          "leave_period",
          "status"
        )
        .where({ user_id: userId })
        .whereIn("status", ["PENDING", "APPROVED"])
        .where("from_date", "<=", endDate)
        .where("to_date", ">=", startDate)
        .orderBy("from_date", "asc"),
      knex("workday_swap_employees")
        .join(
          "workday_swap_groups",
          "workday_swap_groups.id",
          "workday_swap_employees.group_id"
        )
        .select(
          "workday_swap_groups.id",
          knex.raw(
            "workday_swap_groups.holiday_date::text AS holiday_date"
          ),
          knex.raw(
            "workday_swap_groups.replacement_date::text AS replacement_date"
          ),
          "workday_swap_groups.reason"
        )
        .where("workday_swap_employees.user_id", userId)
        .where(function () {
          this.whereBetween("workday_swap_groups.holiday_date", [
            startDate,
            endDate,
          ]).orWhereBetween("workday_swap_groups.replacement_date", [
            startDate,
            endDate,
          ]);
        })
        .orderBy("workday_swap_groups.holiday_date", "asc"),
    ]);

  const events = [
    ...holidays.map((holiday) => ({
      type: holiday.is_all_employees
        ? "COMMON_HOLIDAY"
        : "EMPLOYEE_HOLIDAY",
      date: holiday.date,
      name: holiday.name,
    })),
    ...leaveRequests.map((request) => ({
      type: request.status === "APPROVED" ? "APPROVED_LEAVE" : "PENDING_LEAVE",
      from_date: request.from_date,
      to_date: request.to_date,
      days: Number(request.days),
      leave_period: request.leave_period,
      status: request.status,
    })),
    ...workdaySwaps.flatMap((swap) => [
      {
        type: "COMPENSATION_HOLIDAY",
        date: swap.holiday_date,
        replacement_date: swap.replacement_date,
        reason: swap.reason,
      },
      {
        type: "COMPENSATION_WORKDAY",
        date: swap.replacement_date,
        holiday_date: swap.holiday_date,
        reason: swap.reason,
      },
    ]),
  ].sort((a, b) => {
    const firstDate = a.date || a.from_date;
    const secondDate = b.date || b.from_date;
    return firstDate.localeCompare(secondDate);
  });

  const attendanceByDate = new Map(
    attendance.data.day_summaries.map((day) => [day.work_date, day])
  );

  const calendarEvents = events.map((event) => {
    if (event.type !== "COMPENSATION_WORKDAY") {
      return event;
    }

    const workdayAttendance = attendanceByDate.get(event.date);

    return {
      ...event,
      worked: workdayAttendance
        ? Boolean(
            Number(workdayAttendance.work_min || 0) > 0 ||
              workdayAttendance.first_in
          )
        : null,
      attendance_status: workdayAttendance?.status || null,
    };
  });

  const calendarDays = [];
  const currentDate = new Date(`${startDate}T00:00:00.000Z`);
  const monthEnd = new Date(`${endExclusive}T00:00:00.000Z`);

  while (currentDate < monthEnd) {
    const date = currentDate.toISOString().slice(0, 10);

    calendarDays.push({
      date,
      attendance: attendanceByDate.get(date) || null,
      events: calendarEvents.filter((event) => {
        if (event.date) {
          return event.date === date;
        }

        return event.from_date <= date && event.to_date >= date;
      }),
    });

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return {
    employee: attendance.data.employee,
    calendar: {
      month,
      year,
      days: calendarDays,
      events: calendarEvents,
    },
    attendance,
  };
}

async function getEmployeeCalendar({
  userId,
  empCode,
  month,
  year,
}) {
  const period = getCalendarPeriod(month, year);
  const { employee, calendar } = await buildEmployeeCalendar({
    userId,
    empCode,
    ...period,
  });

  return {
    success: true,
    data: {
      employee: {
        ...employee,
        username: employee.name,
      },
      calendar,
    },
  };
}

async function getEmployeeDashboard({ userId, empCode }) {
  const todayParts = getLocalDateParts();
  const year = Number(todayParts.year);
  const month = Number(todayParts.month);

  const [attendance, leaveBalance, announcements] = await Promise.all([
    attendanceService.getMyAttendance({
      userId,
      empCode,
      month,
      year,
    }),
    leaveService.getMyLeaveBalance({ userId }),
    notificationService.getAnnouncements({ userId }),
  ]);
  const { employee, calendar } = await buildEmployeeCalendar({
    userId,
    empCode,
    month,
    year,
    attendance,
  });

  return {
    success: true,
    data: {
      employee: {
        ...employee,
        username: employee.name,
      },
      today: attendance.data.today,
      calendar,
      lop: {
        month,
        year,
        days: attendance.data.totals.lop_value,
      },
      leave_balance: leaveBalance.data,
      announcements,
    },
  };
}

module.exports = {
  getEmployeeCalendar,
  getEmployeeDashboard,
};
