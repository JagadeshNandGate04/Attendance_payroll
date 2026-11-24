const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");
const { getLocalDateString, getLocalDayBounds } = require("../src/utils/attendanceStatus");

const connection = process.env.TEST_DATABASE_URL;

test("announcement dates, visibility and expired push delivery", {
  skip: !connection && "Set TEST_DATABASE_URL to an isolated PostgreSQL database"
}, async (t) => {
  const schema = `announcement_test_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection });
  let db;
  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection, searchPath: [schema] });
    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261104064126_create_notifications",
      "20261104092535_create_notification_push_jobs",
      "20261124010000_add_announcement_expiry"
    ]) await require(`../migrations/${migration}`).up(db);

    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true, exports: db
    };
    const notifications = require("../src/services/NotificationService");
    const controller = require("../src/controllers/notificationController");
    const [admin, employee, inactive] = await db("users").insert([
      { emp_code: "ADM", name: "Admin", email: "adm@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "EMP", name: "Employee", email: "emp@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "OFF", name: "Inactive", email: "off@test.invalid", role: "EMPLOYEE", status: "INACTIVE", date_of_joining: "2020-01-01" }
    ]).returning("*");
    const today = getLocalDateString();
    function offsetDate(offset) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    }

    for (const expiresOn of [undefined, "", "2025-02-29", "not-a-date", offsetDate(-1)]) {
      await assert.rejects(() => notifications.createAnnouncement({
        actorId: admin.id, title: "Test", message: "Message", expiresOn
      }), { code: "INVALID_ANNOUNCEMENT" });
    }
    let response;
    await controller.createAnnouncement({
      user: { id: admin.id }, body: { title: "Missing date", message: "Test" }
    }, {
      status(code) { response = { code }; return this; },
      json(body) { response.body = body; return this; }
    });
    assert.equal(response.code, 400);
    assert.equal(response.body.error, "INVALID_ANNOUNCEMENT");
    assert.equal(Number((await db("notifications").count({ count: "*" }).first()).count), 0);

    const created = await notifications.createAnnouncement({
      actorId: admin.id, title: " Today ", message: " Important ", expiresOn: today
    });
    assert.deepEqual(created.data, { recipient_count: 1, expires_on: today });
    await notifications.createAnnouncement({
      actorId: admin.id, title: "Tomorrow", message: "Tomorrow", expiresOn: offsetDate(1)
    });
    await db("notifications").insert([
      { user_id: employee.id, type: "ANNOUNCEMENT", title: "Legacy", message: "No expiry" },
      { user_id: employee.id, type: "LEAVE_APPROVED", title: "Leave", message: "Approved", expires_on: offsetDate(-1) }
    ]);
    assert.equal((await db("notifications").where({ user_id: inactive.id })).length, 0);
    let list = await notifications.getNotifications({ userId: employee.id, limit: 2 });
    assert.equal(list.data.pagination.total, 4);
    assert.equal((await notifications.getUnreadCount({ userId: employee.id })).data.unread_count, 4);
    let announcements = await notifications.getAnnouncements({ userId: employee.id });
    assert.equal(announcements.length, 3);
    const todayAnnouncement = announcements.find((item) => item.title === "Today");
    assert.equal(todayAnnouncement.expires_on, today);
    assert.equal(todayAnnouncement.data.expires_on, today);
    const endOfDay = getLocalDayBounds(today).end.getTime();
    t.mock.timers.enable({ apis: ["Date"], now: endOfDay - 1 });
    assert.equal((await notifications.getUnreadCount({ userId: employee.id })).data.unread_count, 4);
    t.mock.timers.setTime(endOfDay);

    list = await notifications.getNotifications({ userId: employee.id, limit: 2, unreadOnly: true });
    assert.equal(list.data.pagination.total, 3);
    assert.equal((await notifications.getUnreadCount({ userId: employee.id })).data.unread_count, 3);
    announcements = await notifications.getAnnouncements({ userId: employee.id });
    assert.deepEqual(new Set(announcements.map((item) => item.title)), new Set(["Tomorrow", "Legacy"]));
    await assert.rejects(() => notifications.markAsRead({
      userId: employee.id, notificationId: todayAnnouncement.id
    }), { code: "NOTIFICATION_NOT_FOUND" });
    assert.equal((await notifications.markAllAsRead({ userId: employee.id })).data.updated_count, 3);
    assert.equal((await db("notifications").where({ id: todayAnnouncement.id }).first()).is_read, false);

    const sent = [];
    let done;
    const deliveries = new Promise((resolve) => { done = resolve; });
    const pushPath = require.resolve("../src/services/NotificationPushService");
    require.cache[pushPath] = {
      id: pushPath, filename: pushPath, loaded: true,
      exports: { async sendPushNotification(notification) {
        sent.push(notification.title);
        if (sent.length === 3) done();
        return { status: "SENT", successCount: 1 };
      } }
    };
    const stop = require("../src/workers/notificationPushWorker").startNotificationPushWorker();
    let timeout;
    try {
      await Promise.race([deliveries, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Push worker timed out")), 3000);
      })]);
    } finally {
      clearTimeout(timeout);
      await stop();
    }
    assert.deepEqual(new Set(sent), new Set(["Tomorrow", "Legacy", "Leave"]));
    const expiredJob = await db("notification_push_jobs")
      .where({ notification_id: todayAnnouncement.id }).first();
    assert.equal(expiredJob.status, "SKIPPED");
    assert.equal(expiredJob.last_error, "Announcement has expired.");
  } finally {
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
