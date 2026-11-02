const knex = require("../config/database");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// HELPER
function generateTemporaryPassword() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789" +
    "@#$%";

  const randomBytes = crypto.randomBytes(12);

  let password = "";

  for (let i = 0; i < 12; i++) {
    password += characters[
      randomBytes[i] % characters.length
    ];
  }

  return password;
}

// // ADMIN DASHBOARD

// async function getAdminDashboard() {
//   try {
//     // TODAY

//     const todayResult = await knex.raw(`
//       SELECT CURRENT_DATE AS today
//     `);

//     const today = todayResult.rows[0].today;

//     // ACTIVE EMPLOYEES

//     const employees = await knex("users")
//       .select("id", "emp_code", "name", "designation")
//       .where("role", "EMPLOYEE")
//       .where("status", "ACTIVE")
//       .orderBy("emp_code", "asc");

//     // LAST PUNCH OF EACH EMPLOYEE TODAY

//     const lastPunches = await knex
//       .select("emp_code", "direction", "punched_at")
//       .from("raw_punches")
//       .whereRaw("punched_at::date = ?", [today])
//       .distinctOn("emp_code")
//       .orderBy([
//         { column: "emp_code", order: "asc" },
//         { column: "punched_at", order: "desc" },
//         { column: "id", order: "desc" },
//       ]);

//     const lastPunchMap = new Map();

//     lastPunches.forEach((punch) => {
//       lastPunchMap.set(punch.emp_code, punch);
//     });

//     // EMPLOYEES ON APPROVED LEAVE TODAY

//     const leaveEmployees = await knex("leave_requests")
//       .select("user_id")
//       .where("status", "APPROVED")
//       .where("from_date", "<=", today)
//       .where("to_date", ">=", today);

//     const leaveUserIds = new Set(
//       leaveEmployees.map((item) => String(item.user_id)),
//     );

//     // BUILD TODAY'S BOARD

//     const todayBoard = {
//       in: [],
//       out: [],
//       absent: [],
//       on_leave: [],
//     };

//     for (const employee of employees) {
//       const employeeData = {
//         id: employee.id,
//         emp_code: employee.emp_code,
//         name: employee.name,
//         designation: employee.designation,
//       };

//       // Approved leave takes priority

//       if (leaveUserIds.has(String(employee.id))) {
//         todayBoard.on_leave.push(employeeData);
//         continue;
//       }

//       const lastPunch = lastPunchMap.get(employee.emp_code);

//       // No punch today = absent

//       if (!lastPunch) {
//         todayBoard.absent.push(employeeData);
//         continue;
//       }

//       employeeData.last_punch_at = lastPunch.punched_at;

//       // Last punch IN = currently IN

//       if (lastPunch.direction === "IN") {
//         todayBoard.in.push(employeeData);
//       }

//       // Last punch OUT = currently OUT
//       else if (lastPunch.direction === "OUT") {
//         todayBoard.out.push(employeeData);
//       }
//     }

//     // PENDING REQUEST COUNTS

//     const [pendingLeave, pendingPermission, pendingRegularization] =
//       await Promise.all([
//         knex("leave_requests")
//           .where("status", "PENDING")
//           .count("* as count")
//           .first(),

//         knex("permission_requests")
//           .where("status", "PENDING")
//           .count("* as count")
//           .first(),

//         knex("regularization_requests")
//           .where("status", "PENDING")
//           .count("* as count")
//           .first(),
//       ]);

//     const pendingRequests = {
//       leave: Number(pendingLeave.count || 0),
//       permission: Number(pendingPermission.count || 0),
//       regularization: Number(pendingRegularization.count || 0),
//     };

//     pendingRequests.total =
//       pendingRequests.leave +
//       pendingRequests.permission +
//       pendingRequests.regularization;

//     // DEVICE HEALTH

//     const devices = await knex("devices")
//       .select("id", "serial_number", "name", "last_seen_at", "is_active")
//       .orderBy("name", "asc");

//     const now = Date.now();

//     const deviceList = devices.map((device) => {
//       let health = "OK";

//       if (!device.is_active) {
//         health = "INACTIVE";
//       } else if (!device.last_seen_at) {
//         health = "ALERT";
//       } else {
//         const lastSeen = new Date(device.last_seen_at).getTime();

//         const diffMinutes = (now - lastSeen) / (1000 * 60);

//         if (diffMinutes > 10) {
//           health = "ALERT";
//         }
//       }

//       return {
//         id: device.id,
//         serial_number: device.serial_number,
//         name: device.name,
//         last_seen_at: device.last_seen_at,
//         is_active: device.is_active,
//         health,
//       };
//     });

//     // UNREGULARIZED DAYS THIS MONTH

//     const unregularizedResult = await knex("day_summaries")
//       .where("needs_regularization", true)
//       .whereRaw(
//         `
//         work_date >= date_trunc(
//           'month',
//           CURRENT_DATE
//         )::date
//       `,
//       )
//       .whereRaw(
//         `
//         work_date < (
//           date_trunc(
//             'month',
//             CURRENT_DATE
//           ) + interval '1 month'
//         )::date
//       `,
//       )
//       .count("* as count")
//       .first();

//     const unregularizedDays = Number(unregularizedResult.count || 0);

//     // FINAL RESPONSE

//     return {
//       success: true,
//       message: "Admin dashboard fetched successfully",

//       data: {
//         date: today,

//         today: {
//           counts: {
//             in: todayBoard.in.length,
//             out: todayBoard.out.length,
//             absent: todayBoard.absent.length,
//             on_leave: todayBoard.on_leave.length,
//             total_employees: employees.length,
//           },

//           employees: todayBoard,
//         },

//         pending_requests: pendingRequests,

//         devices: {
//           total: deviceList.length,

//           ok: deviceList.filter((device) => device.health === "OK").length,

//           alert: deviceList.filter((device) => device.health === "ALERT")
//             .length,

//           inactive: deviceList.filter((device) => device.health === "INACTIVE")
//             .length,

//           list: deviceList,
//         },

//         unregularized_days_this_month: unregularizedDays,
//       },
//     };
//   } catch (error) {
//     console.error("Get admin dashboard service error:", error);

//     throw error;
//   }
// }

// ADMIN DASHBOARD

async function getAdminDashboard({ period = "week" } = {}) {
  try {
    // VALIDATE PERIOD
    if (!["day", "week", "month"].includes(period)) {
      throw new Error("Invalid dashboard period");
    }

    // TODAY (DATABASE DATE AS YYYY-MM-DD)
    const todayResult = await knex.raw(`
      SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS today
    `);

    const today = todayResult.rows[0].today;

    // ACTIVE EMPLOYEES
    const employees = await knex("users")
      .select("id", "emp_code", "name", "designation")
      .where("role", "EMPLOYEE")
      .where("status", "ACTIVE")
      .orderBy("emp_code", "asc");

    // SELECTED PERIOD ATTENDANCE SUMMARY
    const periodCondition = `
      work_date >= CASE
        WHEN ? = 'day' THEN CURRENT_DATE
        WHEN ? = 'week' THEN CURRENT_DATE - INTERVAL '6 days'
        ELSE CURRENT_DATE - INTERVAL '29 days'
      END
      AND work_date <= CURRENT_DATE
    `;

    // TOTAL WORKED HOURS FOR SELECTED PERIOD
    const hoursResult = await knex("day_summaries")
      .whereRaw(periodCondition, [period, period])
      .sum("work_min as total_work_min")
      .first();

    const totalWorkMinutes = Number(
      hoursResult.total_work_min || 0
    );

    const totalWorkedHours = Number(
      (totalWorkMinutes / 60).toFixed(2)
    );

    // DATE-WISE ATTENDANCE CHART
    const chartResult = await knex.raw(
      `
      WITH date_range AS (
        SELECT generate_series(
          CASE
            WHEN ? = 'day' THEN CURRENT_DATE
            WHEN ? = 'week' THEN CURRENT_DATE - INTERVAL '6 days'
            ELSE CURRENT_DATE - INTERVAL '29 days'
          END,
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS work_date
      ),

      attendance_data AS (
        SELECT
          work_date,
          COALESCE(SUM(work_min), 0) AS total_work_min,

          COUNT(*) FILTER (
            WHERE work_min > 0
          ) AS employees_worked,

          COUNT(*) FILTER (
            WHERE is_late = true
          ) AS late_count,

          COUNT(*) FILTER (
            WHERE UPPER(status) = 'ABSENT'
          ) AS absent_count

        FROM day_summaries

        WHERE work_date >= CASE
          WHEN ? = 'day' THEN CURRENT_DATE
          WHEN ? = 'week' THEN CURRENT_DATE - INTERVAL '6 days'
          ELSE CURRENT_DATE - INTERVAL '29 days'
        END

        AND work_date <= CURRENT_DATE

        GROUP BY work_date
      )

      SELECT
        TO_CHAR(date_range.work_date, 'YYYY-MM-DD') AS work_date,

        COALESCE(attendance_data.total_work_min, 0)
          AS total_work_min,

        ROUND(
          COALESCE(attendance_data.total_work_min, 0)::numeric / 60,
          2
        ) AS total_work_hours,

        COALESCE(attendance_data.employees_worked, 0)
          AS employees_worked,

        COALESCE(attendance_data.late_count, 0)
          AS late_count,

        COALESCE(attendance_data.absent_count, 0)
          AS absent_count

      FROM date_range

      LEFT JOIN attendance_data
        ON attendance_data.work_date = date_range.work_date

      ORDER BY date_range.work_date ASC
      `,
      [period, period, period, period]
    );

    const attendanceChart = chartResult.rows.map((row) => ({
      date: row.work_date,
      work_minutes: Number(row.total_work_min || 0),
      work_hours: Number(row.total_work_hours || 0),
      employees_worked: Number(row.employees_worked || 0),
      late_count: Number(row.late_count || 0),
      absent_count: Number(row.absent_count || 0),
    }));

    // TODAY'S ATTENDANCE SUMMARIES
    const todaySummaries = await knex("day_summaries")
      .select(
        "user_id",
        "status",
        "first_in",
        "last_out",
        "work_min",
        "is_late"
      )
      .where("work_date", today);

    const todaySummaryMap = new Map();

    todaySummaries.forEach((summary) => {
      todaySummaryMap.set(
        String(summary.user_id),
        summary
      );
    });

    // TODAY'S LAST PUNCH FOR EACH EMPLOYEE
    const lastPunches = await knex
      .select("emp_code", "direction", "punched_at")
      .from("raw_punches")
      .whereRaw(
        "(punched_at AT TIME ZONE 'Asia/Kolkata')::date = ?",
        [today]
      )
      .whereRaw("punched_at <= NOW()")
      .distinctOn("emp_code")
      .orderBy([
        { column: "emp_code", order: "asc" },
        { column: "punched_at", order: "desc" },
        { column: "id", order: "desc" },
      ]);

    const lastPunchMap = new Map();

    lastPunches.forEach((punch) => {
      lastPunchMap.set(punch.emp_code, punch);
    });

    // EMPLOYEES ON APPROVED LEAVE TODAY
    const leaveEmployees = await knex("leave_requests")
      .select("user_id")
      .where("status", "APPROVED")
      .where("from_date", "<=", today)
      .where("to_date", ">=", today);

    const leaveUserIds = new Set(
      leaveEmployees.map((item) => String(item.user_id))
    );

    // BUILD TODAY'S ATTENDANCE BOARD
    const todayBoard = {
      in: [],
      out: [],
      absent: [],
      on_leave: [],
      weekly_off: [],
      insufficient: [],
      no_punch_yet: [],
    };

    for (const employee of employees) {
      const employeeData = {
        id: employee.id,
        emp_code: employee.emp_code,
        name: employee.name,
        designation: employee.designation,
      };

      const summary = todaySummaryMap.get(
        String(employee.id)
      );

      const lastPunch = lastPunchMap.get(
        employee.emp_code
      );

      const status = String(
        summary?.status || ""
      ).toUpperCase();

      // APPROVED LEAVE
      if (leaveUserIds.has(String(employee.id))) {
        todayBoard.on_leave.push(employeeData);
        continue;
      }

      // LEAVE STATUS FROM DAY SUMMARY
      if (status === "LEAVE") {
        todayBoard.on_leave.push(employeeData);
        continue;
      }

      // WEEKLY OFF
      if (status === "WEEKLY_OFF") {
        todayBoard.weekly_off.push(employeeData);
        continue;
      }

      // ABSENT
      if (status === "ABSENT") {
        todayBoard.absent.push(employeeData);
        continue;
      }

      // // INSUFFICIENT ATTENDANCE DATA
      // if (status === "INSUFFICIENT") {
      //   todayBoard.insufficient.push(employeeData);
      //   continue;
      // }

      // INCLUDE AVAILABLE ATTENDANCE INFORMATION
      if (summary) {
        employeeData.work_min = Number(
          summary.work_min || 0
        );

        employeeData.is_late = Boolean(
          summary.is_late
        );

        employeeData.first_in = summary.first_in;
        employeeData.last_out = summary.last_out;
        employeeData.attendance_status = summary.status;
      }

// CHECK LATEST PUNCH
if (lastPunch) {
  employeeData.last_punch_at = lastPunch.punched_at;
  employeeData.last_punch_direction = lastPunch.direction;

  // Latest punch is IN: employee is currently in the office.
  // This takes priority over INSUFFICIENT summary status.
  if (lastPunch.direction === "IN") {
    todayBoard.in.push(employeeData);
    continue;
  }

  // Latest punch is OUT.
  if (lastPunch.direction === "OUT") {
    if (status === "INSUFFICIENT") {
      todayBoard.insufficient.push(employeeData);
    } else {
      todayBoard.out.push(employeeData);
    }

    continue;
  }

  todayBoard.no_punch_yet.push(employeeData);
  continue;
}

// No punch recorded today.
if (status === "INSUFFICIENT") {
  todayBoard.insufficient.push(employeeData);
} else {
  todayBoard.no_punch_yet.push(employeeData);
}
}
    // PENDING REQUEST COUNTS
    const [
      pendingLeave,
      pendingPermission,
      pendingRegularization,
    ] = await Promise.all([
      knex("leave_requests")
        .where("status", "PENDING")
        .count("* as count")
        .first(),

      knex("permission_requests")
        .where("status", "PENDING")
        .count("* as count")
        .first(),

      knex("regularization_requests")
        .where("status", "PENDING")
        .count("* as count")
        .first(),
    ]);

    const pendingRequests = {
      leave: Number(pendingLeave.count || 0),
      permission: Number(pendingPermission.count || 0),
      regularization: Number(
        pendingRegularization.count || 0
      ),
    };

    pendingRequests.total =
      pendingRequests.leave +
      pendingRequests.permission +
      pendingRequests.regularization;

    // DEVICE HEALTH
    const devices = await knex("devices")
      .select(
        "id",
        "serial_number",
        "name",
        "last_seen_at",
        "is_active"
      )
      .orderBy("name", "asc");

    const now = Date.now();

    const deviceList = devices.map((device) => {
      let health = "OK";

      if (!device.is_active) {
        health = "INACTIVE";
      } else if (!device.last_seen_at) {
        health = "ALERT";
      } else {
        const lastSeen = new Date(
          device.last_seen_at
        ).getTime();

        const diffMinutes =
          (now - lastSeen) / (1000 * 60);

        if (diffMinutes > 10) {
          health = "ALERT";
        }
      }

      return {
        id: device.id,
        serial_number: device.serial_number,
        name: device.name,
        last_seen_at: device.last_seen_at,
        is_active: device.is_active,
        health,
      };
    });

    // UNREGULARIZED DAYS THIS MONTH
    const unregularizedResult = await knex("day_summaries")
      .where("needs_regularization", true)
      .whereRaw(`
        work_date >= date_trunc(
          'month',
          CURRENT_DATE
        )::date
      `)
      .whereRaw(`
        work_date < (
          date_trunc(
            'month',
            CURRENT_DATE
          ) + INTERVAL '1 month'
        )::date
      `)
      .count("* as count")
      .first();

    const unregularizedDays = Number(
      unregularizedResult.count || 0
    );

    // FINAL RESPONSE
    return {
      success: true,
      message: "Admin dashboard fetched successfully",

      data: {
        date: today,
        period,

        attendance_summary: {
          total_employees: employees.length,
          total_work_minutes: totalWorkMinutes,
          total_worked_hours: totalWorkedHours,

          late_count: attendanceChart.reduce(
            (total, item) => total + item.late_count,
            0
          ),
        },

        // ALL ACTIVE EMPLOYEES
        // Independent of today's attendance status
        active_employees: employees.map((employee) => ({
          id: employee.id,
          emp_code: employee.emp_code,
          name: employee.name,
          designation: employee.designation,
        })),

        attendance_chart: attendanceChart,

        // TODAY'S LIVE ATTENDANCE
        today: {
          counts: {
            in: todayBoard.in.length,
            out: todayBoard.out.length,
            absent: todayBoard.absent.length,
            on_leave: todayBoard.on_leave.length,
            weekly_off: todayBoard.weekly_off.length,
            insufficient: todayBoard.insufficient.length,
            no_punch_yet: todayBoard.no_punch_yet.length,
            total_employees: employees.length,
          },

          employees: todayBoard,
        },

        pending_requests: pendingRequests,

        devices: {
          total: deviceList.length,

          ok: deviceList.filter(
            (device) => device.health === "OK"
          ).length,

          alert: deviceList.filter(
            (device) => device.health === "ALERT"
          ).length,

          inactive: deviceList.filter(
            (device) => device.health === "INACTIVE"
          ).length,

          list: deviceList,
        },

        unregularized_days_this_month: unregularizedDays,
      },
    };
  } catch (error) {
    console.error(
      "Get admin dashboard service error:",
      error
    );

    throw error;
  }
}


// GET ADMIN REQUESTS INBOX

async function getAdminRequestsInbox() {
  // FETCH PENDING LEAVE REQUESTS

  const leaveRequests = await knex("leave_requests as lr")
    .select(
      "lr.id",
      "lr.user_id",
      "u.emp_code",
      "u.name",
      "u.designation",

      knex.raw("'LEAVE' as request_type"),

      "lr.from_date",
      "lr.to_date",
      "lr.days",
      "lr.reason",
      "lr.is_retroactive",

      "lr.status",

      "lr.created_at",
    )
    .leftJoin("users as u", "u.id", "lr.user_id")
    .where("lr.status", "PENDING");

  // FETCH PENDING PERMISSION REQUESTS

  const permissionRequests = await knex("permission_requests as pr")
    .select(
      "pr.id",
      "pr.user_id",
      "u.emp_code",
      "u.name",
      "u.designation",

      knex.raw("'PERMISSION' as request_type"),

      "pr.perm_date",
      "pr.start_time",
      "pr.minutes",
      "pr.reason",
      "pr.is_retroactive",

      "pr.status",

      "pr.created_at",
    )
    .leftJoin("users as u", "u.id", "pr.user_id")
    .where("pr.status", "PENDING");

  // FETCH PENDING REGULARIZATION REQUESTS

  const regularizationRequests = await knex("regularization_requests as rr")
    .select(
      "rr.id",
      "rr.user_id",
      "u.emp_code",
      "u.name",
      "u.designation",

      knex.raw("'REGULARIZATION' as request_type"),

      "rr.work_date",
      "rr.type",
      "rr.claimed_in",
      "rr.claimed_out",
      "rr.reason",

      "rr.status",

      "rr.created_at",
    )
    .leftJoin("users as u", "u.id", "rr.user_id")
    .where("rr.status", "PENDING");

  // NORMALIZE LEAVE REQUESTS

  const normalizedLeaveRequests = leaveRequests.map((request) => ({
    id: request.id,

    user_id: request.user_id,

    emp_code: request.emp_code,

    name: request.name,

    designation: request.designation,

    request_type: request.request_type,

    request_date: request.from_date,

    from_date: request.from_date,

    to_date: request.to_date,

    days: request.days,

    start_time: null,

    minutes: null,

    regularization_type: null,

    claimed_in: null,

    claimed_out: null,

    reason: request.reason,

    is_retroactive: request.is_retroactive,

    status: request.status,

    created_at: request.created_at,
  }));

  // NORMALIZE PERMISSION REQUESTS

  const normalizedPermissionRequests = permissionRequests.map((request) => ({
    id: request.id,

    user_id: request.user_id,

    emp_code: request.emp_code,

    name: request.name,

    designation: request.designation,

    request_type: request.request_type,

    request_date: request.perm_date,

    from_date: null,

    to_date: null,

    days: null,

    start_time: request.start_time,

    minutes: request.minutes,

    regularization_type: null,

    claimed_in: null,

    claimed_out: null,

    reason: request.reason,

    is_retroactive: request.is_retroactive,

    status: request.status,

    created_at: request.created_at,
  }));

  // NORMALIZE REGULARIZATION REQUESTS

  const normalizedRegularizationRequests = regularizationRequests.map(
    (request) => ({
      id: request.id,

      user_id: request.user_id,

      emp_code: request.emp_code,

      name: request.name,

      designation: request.designation,

      request_type: request.request_type,

      request_date: request.work_date,

      from_date: null,

      to_date: null,

      days: null,

      start_time: null,

      minutes: null,

      regularization_type: request.type,

      claimed_in: request.claimed_in,

      claimed_out: request.claimed_out,

      reason: request.reason,

      is_retroactive: null,

      status: request.status,

      created_at: request.created_at,
    }),
  );

  // COMBINE ALL REQUESTS

  const requests = [
    ...normalizedLeaveRequests,
    ...normalizedPermissionRequests,
    ...normalizedRegularizationRequests,
  ];

  // SORT BY REQUEST DATE
  //
  // Latest request date first.
  // If same date, latest created request first.

  requests.sort((a, b) => {
    const dateA = new Date(a.request_date).getTime();

    const dateB = new Date(b.request_date).getTime();

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // RESPONSE

  return {
    success: true,

    message: "Admin requests inbox fetched successfully",

    data: {
      total: requests.length,

      requests,
    },
  };
}

// HELPER FOR CREATE EMPLOYEE

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  let password = "";

  for (let i = 0; i < 10; i++) {
    password += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return password;
}
// CREATE EMPLOYEE


async function createEmployee({
  adminId,
  emp_code,
  name,
  email,
  phone,
  designation,
  date_of_joining,
  basic,
  hra = 0,
  special_allowance = 0
}) {

  // VALIDATE REQUIRED FIELDS

  if (
    !emp_code ||
    !name ||
    !email ||
    !date_of_joining
  ) {
    const error = new Error(
      "emp_code, name, email and date_of_joining are required"
    );

    error.code = "REQUIRED_FIELDS";

    throw error;
  }

  // VALIDATE EMAIL

  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    const error = new Error(
      "Invalid email address"
    );

    error.code = "INVALID_EMAIL";

    throw error;
  }

  // VALIDATE DATE

  const joiningDate =
    new Date(`${date_of_joining}T00:00:00Z`);

  if (
    Number.isNaN(joiningDate.getTime()) ||
    joiningDate.toISOString().slice(0, 10) !==
      date_of_joining
  ) {
    const error = new Error(
      "Invalid date_of_joining"
    );

    error.code = "INVALID_DATE";

    throw error;
  }

  // VALIDATE SALARY

  const basicAmount = Number(basic);
  const hraAmount = Number(hra || 0);
  const specialAllowanceAmount =
    Number(special_allowance || 0);

  if (
    !Number.isFinite(basicAmount) ||
    basicAmount < 0 ||
    !Number.isFinite(hraAmount) ||
    hraAmount < 0 ||
    !Number.isFinite(specialAllowanceAmount) ||
    specialAllowanceAmount < 0
  ) {
    const error = new Error(
      "Invalid salary values"
    );

    error.code = "INVALID_SALARY";

    throw error;
  }

  // CHECK DUPLICATE EMP CODE

  const existingEmpCode = await knex("users")
    .where("emp_code", emp_code)
    .first("id");

  if (existingEmpCode) {
    const error = new Error(
      `Employee code ${emp_code} already exists`
    );

    error.code = "DUPLICATE_EMP_CODE";

    throw error;
  }

  // CHECK DUPLICATE EMAIL

  const existingEmail = await knex("users")
    .where("email", email)
    .first("id");

  if (existingEmail) {
    const error = new Error(
      `Email ${email} already exists`
    );

    error.code = "DUPLICATE_EMAIL";

    throw error;
  }

// GENERATE TEMPORARY PASSWORD
const temporaryPassword = "Welcome@123";

// const temporaryPassword =
//   generateTemporaryPassword();

const passwordHash = await bcrypt.hash(
  temporaryPassword,
  10
);

  // GROSS

  const gross =
    basicAmount +
    hraAmount +
    specialAllowanceAmount;

  // TRANSACTION

  return await knex.transaction(async (trx) => {

    // INSERT USER

    const [user] = await trx("users")
      .insert({
        emp_code,
        name,
        email,
        phone: phone || null,
        password_hash: passwordHash,
        role: "EMPLOYEE",
        date_of_joining: date_of_joining,
        designation: designation || null,
        status: "ACTIVE",
        fcm_tokens: JSON.stringify([])
      })
      .returning([
        "id",
        "emp_code",
        "name",
        "email",
        "phone",
        "role",
        "date_of_joining",
        "designation",
        "status",
        "created_at",
        "updated_at"
      ]);

    // INSERT INITIAL SALARY STRUCTURE

    const [salary] = await trx(
      "salary_structures"
    )
      .insert({
        user_id: user.id,

        basic: basicAmount,

        hra: hraAmount,

        special_allowance:
          specialAllowanceAmount,

        gross,

        effective_from:
          date_of_joining,

        effective_to: null
      })
      .returning([
        "id",
        "user_id",
        "basic",
        "hra",
        "special_allowance",
        "gross",
        "effective_from",
        "effective_to"
      ]);

    // AUDIT LOG

    await trx("audit_log").insert({
      actor_id: adminId,

      action: "EMPLOYEE_CREATED",

      entity_type: "users",

      entity_id: user.id,

      before: null,

      after: JSON.stringify({
        id: user.id,
        emp_code: user.emp_code,
        name: user.name,
        email: user.email,
        designation: user.designation,
        status: user.status,
        salary_structure_id: salary.id
      }),

      reason:
        `Employee ${user.emp_code} created`
    });

    // RESPONSE

    return {
      success: true,

      message:
        "Employee created successfully",

      data: {
        employee: user,

        salary_structure: salary,

        temporary_password:
          temporaryPassword
      }
    };
  });
}

// UPDATE EMPLOYEE

async function updateEmployee({
  adminId,
  userId,
  emp_code,
  name,
  email,
  phone,
  designation,
  date_of_joining,
  status,
  basic,
  hra,
  special_allowance,
}) {
  // VALIDATE ID

  const userIdNumber = Number(userId);

  if (!Number.isInteger(userIdNumber) || userIdNumber <= 0) {
    const error = new Error("Invalid employee id");

    error.code = "INVALID_ID";

    throw error;
  }

  // FETCH EMPLOYEE

  const existingEmployee = await knex("users")
    .where("id", userIdNumber)
    .where("role", "EMPLOYEE")
    .first();

  if (!existingEmployee) {
    const error = new Error("Employee not found");

    error.code = "EMPLOYEE_NOT_FOUND";

    throw error;
  }

  // VALIDATE STATUS

  if (status !== undefined && !["ACTIVE", "INACTIVE"].includes(status)) {
    const error = new Error("Status must be ACTIVE or INACTIVE");

    error.code = "INVALID_STATUS";

    throw error;
  }

  // VALIDATE EMAIL IF PROVIDED

  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      const error = new Error("Invalid email address");

      error.code = "INVALID_EMAIL";

      throw error;
    }
  }

  // CHECK DUPLICATE EMP CODE

  if (emp_code !== undefined && emp_code !== existingEmployee.emp_code) {
    const duplicateEmpCode = await knex("users")
      .where("emp_code", emp_code)
      .whereNot("id", userIdNumber)
      .first("id");

    if (duplicateEmpCode) {
      const error = new Error(`Employee code ${emp_code} already exists`);

      error.code = "DUPLICATE_EMP_CODE";

      throw error;
    }
  }

  // CHECK DUPLICATE EMAIL

  if (email !== undefined && email !== existingEmployee.email) {
    const duplicateEmail = await knex("users")
      .where("email", email)
      .whereNot("id", userIdNumber)
      .first("id");

    if (duplicateEmail) {
      const error = new Error(`Email ${email} already exists`);

      error.code = "DUPLICATE_EMAIL";

      throw error;
    }
  }

  // SALARY VALIDATION

  const salaryProvided =
    basic !== undefined || hra !== undefined || special_allowance !== undefined;

  if (salaryProvided) {
    const basicAmount = Number(basic ?? 0);

    const hraAmount = Number(hra ?? 0);

    const specialAllowanceAmount = Number(special_allowance ?? 0);

    if (
      !Number.isFinite(basicAmount) ||
      basicAmount < 0 ||
      !Number.isFinite(hraAmount) ||
      hraAmount < 0 ||
      !Number.isFinite(specialAllowanceAmount) ||
      specialAllowanceAmount < 0
    ) {
      const error = new Error("Invalid salary values");

      error.code = "INVALID_SALARY";

      throw error;
    }
  }

  // BUILD USER UPDATE

  const userUpdate = {};

  if (emp_code !== undefined) userUpdate.emp_code = emp_code;

  if (name !== undefined) userUpdate.name = name;

  if (email !== undefined) userUpdate.email = email;

  if (phone !== undefined) userUpdate.phone = phone;

  if (designation !== undefined) userUpdate.designation = designation;

  if (date_of_joining !== undefined)
    userUpdate.date_of_joining = date_of_joining;

  if (status !== undefined) userUpdate.status = status;

  // TRANSACTION

  return await knex.transaction(async (trx) => {
    // UPDATE USER

    let updatedEmployee = existingEmployee;

    if (Object.keys(userUpdate).length > 0) {
      [updatedEmployee] = await trx("users")
        .where("id", userIdNumber)
        .update(userUpdate)
        .returning([
          "id",
          "emp_code",
          "name",
          "email",
          "phone",
          "role",
          "date_of_joining",
          "designation",
          "status",
          "created_at",
          "updated_at",
        ]);
    }

    // SALARY REVISION

    let newSalary = null;

    if (salaryProvided) {
      const currentSalary = await trx("salary_structures")
        .where("user_id", userIdNumber)
        .whereNull("effective_to")
        .orderBy("effective_from", "desc")
        .first();

      const effectiveFrom = date_of_joining || existingEmployee.date_of_joining;

      const basicAmount = Number(basic ?? currentSalary?.basic ?? 0);

      const hraAmount = Number(hra ?? currentSalary?.hra ?? 0);

      const specialAllowanceAmount = Number(
        special_allowance ?? currentSalary?.special_allowance ?? 0,
      );

      const gross = basicAmount + hraAmount + specialAllowanceAmount;

      // CLOSE CURRENT SALARY

      if (currentSalary) {
        await trx("salary_structures").where("id", currentSalary.id).update({
          effective_to: effectiveFrom,
        });
      }

      // CREATE NEW SALARY

      [newSalary] = await trx("salary_structures")
        .insert({
          user_id: userIdNumber,

          basic: basicAmount,

          hra: hraAmount,

          special_allowance: specialAllowanceAmount,

          gross,

          effective_from: effectiveFrom,

          effective_to: null,
        })
        .returning([
          "id",
          "user_id",
          "basic",
          "hra",
          "special_allowance",
          "gross",
          "effective_from",
          "effective_to",
        ]);
    }

    // AUDIT

    await trx("audit_log").insert({
      actor_id: adminId,

      action: "EMPLOYEE_UPDATED",

      entity_type: "users",

      entity_id: userIdNumber,

      before: JSON.stringify({
        employee: existingEmployee,
      }),

      after: JSON.stringify({
        employee: updatedEmployee,
        salary_structure: newSalary,
      }),

      reason: `Employee ${existingEmployee.emp_code} updated`,
    });

    // RESPONSE

    return {
      success: true,

      message: "Employee updated successfully",

      data: {
        employee: updatedEmployee,

        salary_structure: newSalary,
      },
    };
  });
}

// ADD EMPLOYEE SALARY STRUCTURE

async function addEmployeeSalary({
  adminId,
  userId,
  basic,
  hra = 0,
  special_allowance = 0,
  effective_from,
}) {
  // VALIDATE ID

  const userIdNumber = Number(userId);

  if (!Number.isInteger(userIdNumber) || userIdNumber <= 0) {
    const error = new Error("Invalid employee id");

    error.code = "INVALID_ID";

    throw error;
  }

  // VALIDATE REQUIRED FIELDS

  if (basic === undefined || basic === null || !effective_from) {
    const error = new Error("basic and effective_from are required");

    error.code = "REQUIRED_FIELDS";

    throw error;
  }

  // CHECK EMPLOYEE

  const employee = await knex("users")
    .where("id", userIdNumber)
    .where("role", "EMPLOYEE")
    .first(["id", "emp_code", "name", "email", "status"]);

  if (!employee) {
    const error = new Error("Employee not found");

    error.code = "EMPLOYEE_NOT_FOUND";

    throw error;
  }

  // VALIDATE SALARY

  const basicAmount = Number(basic);

  const hraAmount = Number(hra || 0);

  const specialAllowanceAmount = Number(special_allowance || 0);

  if (
    !Number.isFinite(basicAmount) ||
    basicAmount < 0 ||
    !Number.isFinite(hraAmount) ||
    hraAmount < 0 ||
    !Number.isFinite(specialAllowanceAmount) ||
    specialAllowanceAmount < 0
  ) {
    const error = new Error("Invalid salary values");

    error.code = "INVALID_SALARY";

    throw error;
  }

  // VALIDATE EFFECTIVE DATE

  const effectiveDate = new Date(`${effective_from}T00:00:00Z`);

  if (
    Number.isNaN(effectiveDate.getTime()) ||
    effectiveDate.toISOString().slice(0, 10) !== effective_from
  ) {
    const error = new Error("Invalid effective_from date");

    error.code = "INVALID_DATE";

    throw error;
  }

  // TRANSACTION

  return await knex.transaction(async (trx) => {
    // FIND CURRENT SALARY STRUCTURE

    const currentSalary = await trx("salary_structures")
      .where("user_id", userIdNumber)
      .whereNull("effective_to")
      .orderBy("effective_from", "desc")
      .first();

    // VALIDATE EFFECTIVE DATE AGAINST
    // CURRENT SALARY

    if (currentSalary && effective_from <= currentSalary.effective_from) {
      const error = new Error(
        "effective_from must be later than the current salary effective_from",
      );

      error.code = "INVALID_EFFECTIVE_DATE";

      throw error;
    }

    // CALCULATE GROSS

    const gross = basicAmount + hraAmount + specialAllowanceAmount;

    // CLOSE CURRENT SALARY

    if (currentSalary) {
      // Old salary is valid until
      // one day before the new salary starts.

      const oldEffectiveTo = new Date(effectiveDate);

      oldEffectiveTo.setUTCDate(oldEffectiveTo.getUTCDate() - 1);

      const oldEffectiveToDate = oldEffectiveTo.toISOString().slice(0, 10);

      await trx("salary_structures").where("id", currentSalary.id).update({
        effective_to: oldEffectiveToDate,
      });
    }

    // INSERT NEW SALARY STRUCTURE

    const [newSalary] = await trx("salary_structures")
      .insert({
        user_id: userIdNumber,

        basic: basicAmount,

        hra: hraAmount,

        special_allowance: specialAllowanceAmount,

        gross,

        effective_from: effective_from,

        effective_to: null,
      })
      .returning([
        "id",
        "user_id",
        "basic",
        "hra",
        "special_allowance",
        "gross",
        "effective_from",
        "effective_to",
      ]);

    // AUDIT LOG

    await trx("audit_log").insert({
      actor_id: adminId,

      action: "SALARY_STRUCTURE_CREATED",

      entity_type: "salary_structures",

      entity_id: newSalary.id,

      before: currentSalary ? JSON.stringify(currentSalary) : null,

      after: JSON.stringify(newSalary),

      reason: `Salary structure revised for employee ${employee.emp_code}`,
    });

    // RESPONSE

    return {
      success: true,

      message: "Employee salary structure added successfully",

      data: {
        employee: {
          id: employee.id,
          emp_code: employee.emp_code,
          name: employee.name,
        },

        previous_salary: currentSalary || null,

        salary_structure: newSalary,
      },
    };
  });
}

// ADJUST EMPLOYEE LEAVE BALANCE

async function adjustEmployeeLeave({ adminId, userId, delta, note }) {
  // VALIDATE ID

  const userIdNumber = Number(userId);

  if (!Number.isInteger(userIdNumber) || userIdNumber <= 0) {
    const error = new Error("Invalid employee id");

    error.code = "INVALID_ID";

    throw error;
  }

  // CHECK EMPLOYEE

  const employee = await knex("users")
    .where("id", userIdNumber)
    .where("role", "EMPLOYEE")
    .first(["id", "emp_code", "name", "email", "status"]);

  if (!employee) {
    const error = new Error("Employee not found");

    error.code = "EMPLOYEE_NOT_FOUND";

    throw error;
  }

  // VALIDATE DELTA

  const deltaNumber = Number(delta);

  if (!Number.isFinite(deltaNumber) || deltaNumber === 0) {
    const error = new Error("delta must be a non-zero number");

    error.code = "INVALID_DELTA";

    throw error;
  }

  // VALIDATE NOTE

  if (typeof note !== "string" || !note.trim()) {
    const error = new Error("note is required");

    error.code = "INVALID_NOTE";

    throw error;
  }

  // TRANSACTION

  return await knex.transaction(async (trx) => {
    // GET CURRENT BALANCE

    const balanceResult = await trx("leave_ledger")
      .where("user_id", userIdNumber)
      .sum("delta as balance")
      .first();

    const currentBalance = Number(balanceResult.balance || 0);

    // CALCULATE NEW BALANCE

    const newBalance = currentBalance + deltaNumber;

    // INSERT ADJUSTMENT

    const [adjustment] = await trx("leave_ledger")
      .insert({
        user_id: userIdNumber,

        entry_date: trx.raw("CURRENT_DATE"),

        delta: deltaNumber,

        type: "ADJUSTMENT",

        leave_request_id: null,

        note: note.trim(),
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
        "updated_at",
      ]);

    // AUDIT LOG

    await trx("audit_log").insert({
      actor_id: adminId,

      action: "BALANCE_ADJUSTED",

      entity_type: "leave_ledger",

      entity_id: adjustment.id,

      before: JSON.stringify({
        balance: currentBalance,
      }),

      after: JSON.stringify({
        balance: newBalance,
        adjustment: adjustment,
      }),

      reason: note.trim(),
    });

    // RESPONSE

    return {
      success: true,

      message: "Employee leave balance adjusted successfully",

      data: {
        employee: {
          id: employee.id,
          emp_code: employee.emp_code,
          name: employee.name,
        },

        adjustment: adjustment,

        previous_balance: currentBalance,

        new_balance: newBalance,
      },
    };
  });
}

module.exports = {
  getAdminDashboard,
  getAdminRequestsInbox,
  generateTemporaryPassword,
  createEmployee,
  updateEmployee,
  addEmployeeSalary,
  adjustEmployeeLeave,
};