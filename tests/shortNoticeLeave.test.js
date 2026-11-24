const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");
const { isShortNotice } = require("../src/utils/leaveNotification");

const connection = process.env.TEST_DATABASE_URL;

test("short notice uses local calendar dates including year and leap-day boundaries", () => {
  assert.equal(isShortNotice("2026-12-31", "2026-12-31"), true);
  assert.equal(isShortNotice("2027-01-01", "2026-12-31"), true);
  assert.equal(isShortNotice("2027-01-02", "2026-12-31"), false);
  assert.equal(isShortNotice("2026-12-30", "2026-12-31"), false);
  assert.equal(isShortNotice("2028-02-29", "2028-02-28"), true);
  assert.equal(isShortNotice("2028-03-01", "2028-02-28"), false);
});

test("short-notice notifications and half-day leave integration", {
  skip: !connection && "Set TEST_DATABASE_URL to an isolated PostgreSQL database"
}, async () => {
  const schema = `leave_test_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection });
  let db;

  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection, searchPath: [schema] });

    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261104064126_create_notifications",
      "20261104092535_create_notification_push_jobs",
      "20261106094743_create_attendance_lop_adjustments",
      "20261113093000_create_workday_swaps",
      "20261113043442_rename_shutdown_date_to_holiday_date",
      "20261116000000_add_holiday_employee_scope",
      "20261124000000_add_leave_period",
      "20261124010000_add_announcement_expiry"
    ]) {
      await require(`../migrations/${migration}`).up(db);
    }

    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = {
      id: databasePath,
      filename: databasePath,
      loaded: true,
      exports: db
    };

    const leaveService = require("../src/services/LeaveService");
    const attendanceService = require("../src/services/AttendanceService");
    const notificationService = require("../src/services/NotificationService");

    const [admin, inactiveAdmin, employee, secondEmployee, limitEmployee] = await db("users")
      .insert([
        { emp_code: "A1", name: "Admin", email: "a1@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
        { emp_code: "A2", name: "Inactive", email: "a2@test.invalid", role: "ADMIN", status: "INACTIVE", date_of_joining: "2020-01-01" },
        { emp_code: "E1", name: "Employee", email: "e1@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
        { emp_code: "E2", name: "Second", email: "e2@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
        { emp_code: "E3", name: "Limit", email: "e3@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" }
      ]).returning("*");
    await db("settings").insert({ key: "weekly_off_days", value: JSON.stringify([]) });
    await db("leave_ledger").insert([employee, secondEmployee, limitEmployee].map((user) => ({
      user_id: user.id, entry_date: "2020-01-01", delta: 9, type: "ACCRUED"
    })));

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.TIMEZONE || "Asia/Kolkata",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    function dateOffset(days) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    }
    async function apply(user, date, leavePeriod) {
      return leaveService.applyMyLeave({
        userId: user.id, fromDate: date, toDate: date,
        reason: "Emergency", leavePeriod
      });
    }
    async function approve(request) {
      return leaveService.decideAdminLeave({
        adminId: admin.id, leaveRequestId: request.data.leave_request.id,
        action: "APPROVE", note: "Approved"
      });
    }

    const ordinary = await apply(employee, dateOffset(3));
    const tomorrow = await apply(employee, dateOffset(1), "MORNING");
    const sameDay = await apply(secondEmployee, today, "AFTERNOON");
    const retroactive = await apply(secondEmployee, dateOffset(-2));
    assert.equal(tomorrow.data.leave_request.days, "0.5");
    assert.equal(tomorrow.data.leave_calculation.monthly_breakdown[dateOffset(1).slice(0, 7)], 0.5);
    assert.equal(tomorrow.data.balance.available_after_reservation, 7.5);
    assert.equal(sameDay.data.leave_request.status, "PENDING");
    await assert.rejects(() => apply(employee, dateOffset(1), "AFTERNOON"),
      { code: "LEAVE_DATE_CONFLICT" });
    await assert.rejects(() => leaveService.applyMyLeave({
      userId: employee.id, fromDate: today, toDate: dateOffset(1),
      reason: "test", leavePeriod: "MORNING"
    }), { code: "INVALID_LEAVE_PERIOD" });
    await assert.rejects(() => apply(employee, dateOffset(4), "OTHER"),
      { code: "INVALID_LEAVE_PERIOD" });

    const notifications = (await notificationService.getNotifications({ userId: admin.id })).data.notifications;
    assert.deepEqual(notifications.map((n) => n.data.priority), ["HIGH", "HIGH", "NORMAL", "NORMAL"]);
    assert.equal(notifications[0].data.leave_period, "AFTERNOON");
    assert.equal(notifications[1].data.employee_name, "Employee");
    assert.equal((await db("notifications").where({ user_id: inactiveAdmin.id })).length, 0);
    assert.equal((await db("notification_push_jobs")).length, 4);
    const sentPriorities = [];
    let deliveryComplete;
    const deliveries = new Promise((resolve) => { deliveryComplete = resolve; });
    const pushServicePath = require.resolve("../src/services/NotificationPushService");
    require.cache[pushServicePath] = {
      id: pushServicePath, filename: pushServicePath, loaded: true,
      exports: {
        async sendPushNotification(notification) {
          sentPriorities.push(notification.data.priority);
          if (sentPriorities.length === 4) deliveryComplete();
          return { status: "SENT", successCount: 1 };
        }
      }
    };
    const { startNotificationPushWorker } = require("../src/workers/notificationPushWorker");
    const stopWorker = startNotificationPushWorker();
    let timeout;
    try {
      await Promise.race([
        deliveries,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Push worker did not deliver jobs")), 3000);
        })
      ]);
    } finally {
      clearTimeout(timeout);
      await stopWorker();
    }
    assert.deepEqual(sentPriorities, ["HIGH", "HIGH", "NORMAL", "NORMAL"]);
    await notificationService.markAsRead({ userId: admin.id, notificationId: notifications[0].id });
    assert.equal((await db("leave_requests").where({ id: sameDay.data.leave_request.id }).first()).status, "PENDING");
    assert.equal((await notificationService.getNotifications({ userId: admin.id })).data.notifications[0].id, notifications[1].id);

    await approve(tomorrow);
    assert.equal((await db("day_summaries").where({ user_id: employee.id, work_date: dateOffset(1) })).length, 0);
    const ledger = await db("leave_ledger").where({ leave_request_id: tomorrow.data.leave_request.id }).first();
    assert.equal(Number(ledger.delta), -0.5);
    assert.equal((await leaveService.getMyLeaveBalance({ userId: employee.id })).data.pending_days, 1);
    assert.equal((await leaveService.getMyLeaveRequests({
      userId: employee.id, year: Number(dateOffset(1).slice(0, 4)),
      month: Number(dateOffset(1).slice(5, 7))
    })).data.leave_requests.find((request) => request.id === tomorrow.data.leave_request.id).leave_period, "MORNING");

    const past = dateOffset(-4);
    const pastRequest = await apply(employee, past, "AFTERNOON");
    await approve(pastRequest);
    let summary = await db("day_summaries").where({ user_id: employee.id, work_date: past }).first();
    assert.equal(summary.status, "ABSENT");
    assert.equal(Number(summary.lop_value), 1);
    await db("correction_punches").insert([
      { user_id: employee.id, punched_at: `${past}T04:00:00Z`, direction: "IN", source: "ADMIN", created_by: admin.id, reason: "test" },
      { user_id: employee.id, punched_at: `${past}T08:00:00Z`, direction: "OUT", source: "ADMIN", created_by: admin.id, reason: "test" }
    ]);
    await attendanceService.recomputeDay(employee.id, past);
    summary = await db("day_summaries").where({ user_id: employee.id, work_date: past }).first();
    assert.equal(summary.status, "HALF_DAY");
    assert.equal(Number(summary.lop_value), 0);
    assert.equal(summary.work_min, 240);
    await db("correction_punches").where({ user_id: employee.id, direction: "OUT" })
      .update({ punched_at: `${past}T07:59:00Z` });
    await attendanceService.recomputeDay(employee.id, past);
    summary = await db("day_summaries").where({ user_id: employee.id, work_date: past }).first();
    assert.equal(summary.status, "ABSENT");
    assert.equal(Number(summary.lop_value), 1);
    await db("correction_punches").where({ user_id: employee.id, direction: "OUT" }).update({ is_voided: true });
    await attendanceService.recomputeDay(employee.id, past);
    summary = await db("day_summaries").where({ user_id: employee.id, work_date: past }).first();
    assert.equal(summary.status, "INSUFFICIENT");
    assert.equal(Number(summary.lop_value), 0.5);
    assert.equal(summary.needs_regularization, true);

    const attendanceMonth = {
      userId: employee.id,
      year: Number(past.slice(0, 4)),
      month: Number(past.slice(5, 7))
    };
    const myAttendance = await attendanceService.getMyAttendance(attendanceMonth);
    const pastDay = myAttendance.data.day_summaries.find((day) => day.work_date === past);
    assert.equal(pastDay.leave_period, "AFTERNOON");
    assert.ok(myAttendance.data.totals.leave >= 0.5);
    const adminAttendance = await attendanceService.getAdminMonthlyAttendance(attendanceMonth);
    assert.equal(adminAttendance.data.days.find((day) => day.date === past).leave[0].leave_period, "AFTERNOON");
    assert.ok(adminAttendance.data.totals.leave >= 0.5);

    await approve(ordinary);
    summary = await db("day_summaries").where({ user_id: employee.id, work_date: dateOffset(3) }).first();
    assert.equal(summary.status, "LEAVE");
    assert.equal(Number(summary.lop_value), 0);
    assert.equal(retroactive.data.leave_request.is_retroactive, true);

    await apply(limitEmployee, "2040-05-01", "MORNING");
    const halfToApprove = await apply(limitEmployee, "2040-05-02", "AFTERNOON");
    await apply(limitEmployee, "2040-05-03", "MORNING");
    await apply(limitEmployee, "2040-05-04");
    await apply(limitEmployee, "2040-05-05", "AFTERNOON");
    await assert.rejects(() => apply(limitEmployee, "2040-05-06", "MORNING"),
      { code: "MONTHLY_LEAVE_LIMIT_EXCEEDED" });
    await approve(halfToApprove);
    assert.equal((await db("leave_requests").where({ id: halfToApprove.data.leave_request.id }).first()).status, "APPROVED");
    const lockedRequest = await apply(limitEmployee, "2040-06-02", "MORNING");
    await db("day_summaries").insert({
      user_id: limitEmployee.id, work_date: "2040-06-02",
      status: "ABSENT", is_locked: true
    });
    await assert.rejects(() => approve(lockedRequest), { code: "MONTH_LOCKED" });
    assert.equal((await db("leave_requests").where({ id: lockedRequest.data.leave_request.id }).first()).status, "PENDING");
    assert.equal(await db("leave_ledger").where({ leave_request_id: lockedRequest.data.leave_request.id }).first(), undefined);
    await assert.rejects(() => require("../migrations/20261124000000_add_leave_period").down(db),
      /half-day requests exist/);
  } finally {
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
