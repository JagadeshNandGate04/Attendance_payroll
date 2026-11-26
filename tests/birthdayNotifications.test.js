const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");
const { getLocalDayBounds } = require("../src/utils/attendanceStatus");

const connection = process.env.TEST_DATABASE_URL;

test("birthday profile synchronization and notifications", {
  skip: !connection && "Set TEST_DATABASE_URL to an isolated PostgreSQL database"
}, async (t) => {
  const schema = `birthday_test_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection });
  let db;
  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection, searchPath: [schema] });
    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261104064126_create_notifications",
      "20261104092535_create_notification_push_jobs",
      "20261112043401_create_employee_profiles",
      "20261112043402_create_employee_profile_approvals_and_documents",
      "20261124010000_add_announcement_expiry"
    ]) await require(`../migrations/${migration}`).up(db);

    const [admin, birthday, leap, coworker, inactive, inactiveAdmin] = await db("users").insert([
      { emp_code: "ADM", name: "Admin", email: "adm@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E1", name: "Alex", email: "e1@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E2", name: "Sam", email: "e2@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E3", name: "Pat", email: "e3@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E4", name: "Inactive", email: "e4@test.invalid", role: "EMPLOYEE", status: "INACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "A2", name: "Old Admin", email: "a2@test.invalid", role: "ADMIN", status: "INACTIVE", date_of_joining: "2020-01-01" }
    ]).returning("*");
    await db("employee_profiles").insert([
      { user_id: birthday.id, date_of_birth: "1990-02-28" },
      { user_id: leap.id, date_of_birth: "1992-02-29" },
      { user_id: coworker.id },
      { user_id: inactive.id, date_of_birth: "1990-02-28" }
    ]);
    await require("../migrations/20261124020000_add_employee_birthdays").up(db);

    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true, exports: db
    };
    const profiles = require("../src/services/employeeProfileService");
    const { processBirthdays, getEmployeeBirthdays } = require("../src/services/birthdayNotificationService");
    const notifications = require("../src/services/NotificationService");
    process.env.JWT_SECRET = "birthday-test-secret";
    const express = require("express");
    const jwt = require("jsonwebtoken");
    const app = express();
    app.use("/api/v1/notifications", require("../src/routes/notificationRoutes"));
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
    const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { algorithm: "HS256" });
    async function get(path, id) {
      const response = await fetch(`${base}${path}`, {
        headers: id ? { Authorization: `Bearer ${token(id)}` } : {}
      });
      return { status: response.status, body: await response.json() };
    }

    try {
      const noToken = await get("/me/birthdays");
      assert.equal(noToken.status, 401);
      assert.equal((await get("/admin/birthdays", birthday.id)).status, 403);
      assert.equal((await get("/me/birthdays", admin.id)).status, 403);
      const allBirthdays = await get("/me/birthdays", coworker.id);
      assert.equal(allBirthdays.status, 200);
      assert.equal(allBirthdays.body.data.month, null);
      assert.deepEqual(allBirthdays.body.data.birthdays, [
        { id: birthday.id, emp_code: "E1", name: "Alex", month: 2, day: 28 },
        { id: leap.id, emp_code: "E2", name: "Sam", month: 2, day: 29 }
      ]);
      assert.deepEqual((await get("/admin/birthdays?month=02", admin.id)).body.data.birthdays,
        allBirthdays.body.data.birthdays);
      assert.deepEqual((await get("/me/birthdays?month=3", birthday.id)).body.data.birthdays, []);
      for (const month of ["0", "13", "2.5", "", "abc", "2&month=3"]) {
        const invalid = await get(`/admin/birthdays?month=${month}`, admin.id);
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.error, "INVALID_MONTH");
      }
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    let user = await db("users").select(db.raw("date_of_birth::text AS dob")).where({ id: birthday.id }).first();
    assert.equal(user.dob, "1990-02-28");
    const submission = await profiles.submitPersonalDetailsRequest({
      userId: coworker.id, personalDetails: { date_of_birth: "1991-04-15" }
    });
    user = await db("users").where({ id: coworker.id }).first();
    assert.equal(user.date_of_birth, null);
    assert.equal((await getEmployeeBirthdays({ month: "4" })).data.birthdays.length, 0);
    await profiles.approvePersonalDetailsRequest({
      requestId: submission.data.request.id, adminId: admin.id
    });
    user = await db("users").select(db.raw("date_of_birth::text AS dob")).where({ id: coworker.id }).first();
    assert.equal(user.dob, "1991-04-15");
    assert.deepEqual((await getEmployeeBirthdays()).data.birthdays.map((item) => [item.month, item.day]),
      [[2, 28], [2, 29], [4, 15]]);
    assert.equal((await getEmployeeBirthdays({ month: "4" })).data.birthdays[0].name, "Pat");
    const clearing = await profiles.submitPersonalDetailsRequest({
      userId: coworker.id, personalDetails: { date_of_birth: null }
    });
    await profiles.approvePersonalDetailsRequest({ requestId: clearing.data.request.id, adminId: admin.id });
    assert.equal((await db("users").where({ id: coworker.id }).first()).date_of_birth, null);
    assert.equal((await getEmployeeBirthdays({ month: "4" })).data.birthdays.length, 0);
    const rejected = await profiles.submitPersonalDetailsRequest({
      userId: coworker.id, personalDetails: { date_of_birth: "1990-02-28" }
    });
    await profiles.rejectPersonalDetailsRequest({
      requestId: rejected.data.request.id, adminId: admin.id, approvalRemarks: "Incorrect date"
    });
    assert.equal((await db("users").where({ id: coworker.id }).first()).date_of_birth, null);

    const date = "2027-02-28";
    t.mock.timers.enable({ apis: ["Date"], now: getLocalDayBounds(date).start.getTime() });
    const results = await Promise.all([processBirthdays(), processBirthdays()]);
    assert.equal(results.reduce((sum, result) => sum + result.notifications_created, 0), 8);
    const all = await db("notifications").orderBy("user_id").orderBy("entity_id");
    assert.equal(all.length, 8);
    assert.equal(all.filter((n) => n.type === "BIRTHDAY_WISH").length, 2);
    assert.equal(all.filter((n) => n.type === "EMPLOYEE_BIRTHDAY").length, 6);
    assert.equal(all.filter((n) => String(n.user_id) === String(admin.id)).length, 2);
    assert.equal(all.filter((n) => String(n.user_id) === String(inactive.id)).length, 0);
    assert.equal(all.filter((n) => String(n.user_id) === String(inactiveAdmin.id)).length, 0);
    assert.equal(all.find((n) => String(n.user_id) === String(birthday.id) &&
      String(n.entity_id) === String(birthday.id)).type, "BIRTHDAY_WISH");
    assert.equal(all.find((n) => String(n.user_id) === String(birthday.id) &&
      String(n.entity_id) === String(leap.id)).type, "EMPLOYEE_BIRTHDAY");
    const employeeServer = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    try {
      const url = `http://127.0.0.1:${employeeServer.address().port}/api/v1/notifications/me/get-notifications`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token(coworker.id)}` }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      const birthdayNotifications = body.data.notifications.filter((n) => n.type === "EMPLOYEE_BIRTHDAY");
      assert.deepEqual(new Set(birthdayNotifications.map((n) => String(n.entity_id))),
        new Set([String(birthday.id), String(leap.id)]));
      assert.ok(birthdayNotifications.every((n) => !n.is_read && n.expires_on === date));
    } finally {
      await new Promise((resolve, reject) => employeeServer.close((error) => error ? reject(error) : resolve()));
    }
    assert.equal(all[0].data.birthday_date, date);
    assert.equal(all[0].data.expires_on, date);
    assert.equal(Object.hasOwn(all[0].data, "date_of_birth"), false);
    assert.equal((await db("notification_push_jobs")).length, 8);
    assert.equal((await processBirthdays()).notifications_created, 0);
    assert.equal((await notifications.getUnreadCount({ userId: admin.id })).data.unread_count, 2);

    const end = getLocalDayBounds(date).end.getTime();
    t.mock.timers.setTime(end - 1);
    assert.equal((await notifications.getNotifications({ userId: admin.id })).data.pagination.total, 2);
    t.mock.timers.setTime(end);
    assert.equal((await notifications.getNotifications({ userId: admin.id })).data.pagination.total, 0);
    assert.equal((await notifications.getUnreadCount({ userId: admin.id })).data.unread_count, 0);
    assert.equal((await db("notifications")).length, 8);

    let sent = 0;
    const pushPath = require.resolve("../src/services/NotificationPushService");
    require.cache[pushPath] = {
      id: pushPath, filename: pushPath, loaded: true,
      exports: { async sendPushNotification() { sent += 1; return { status: "SENT" }; } }
    };
    const stopWorker = require("../src/workers/notificationPushWorker").startNotificationPushWorker();
    try {
      const deadline = process.hrtime.bigint() + 3000000000n;
      while (Number((await db("notification_push_jobs").where({ status: "SKIPPED" }).count({ count: "*" }).first()).count) < 8) {
        if (process.hrtime.bigint() > deadline) throw new Error("Expired push jobs were not skipped");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      await stopWorker();
    }
    assert.equal(sent, 0);

    const leapDay = "2028-02-29";
    t.mock.timers.setTime(getLocalDayBounds(leapDay).start.getTime());
    const leapResult = await processBirthdays();
    assert.equal(leapResult.birthdays, 1);
    assert.equal(leapResult.notifications_created, 4);
    t.mock.timers.setTime(getLocalDayBounds("2028-02-28").start.getTime());
    assert.equal((await processBirthdays()).birthdays, 1);

    await db("employee_profiles").where({ user_id: leap.id }).del();
    assert.equal((await db("users").where({ id: leap.id }).first()).date_of_birth, null);
  } finally {
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
