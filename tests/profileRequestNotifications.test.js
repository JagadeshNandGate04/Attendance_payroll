const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");

test("profile requests notify active admins atomically", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to an isolated PostgreSQL database",
}, async () => {
  const schema = `profile_notify_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL });
  let db;
  let server;
  const previousSecret = process.env.JWT_SECRET;
  const previousKey = process.env.IDENTITY_ENCRYPTION_KEY;
  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL, searchPath: [schema] });
    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261104064126_create_notifications",
      "20261104092535_create_notification_push_jobs",
      "20261112043401_create_employee_profiles",
      "20261112043402_create_employee_profile_details",
      "20261112043402_create_employee_sensitive_details",
      "20261112043402_create_employee_profile_approvals_and_documents",
      "20261124010000_add_announcement_expiry",
    ]) await require(`../migrations/${migration}`).up(db);

    const [employee, admin, secondAdmin, inactiveAdmin, coworker] = await db("users").insert([
      { emp_code: "EMP", name: "Employee", email: "emp@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "A1", name: "Admin", email: "a1@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "A2", name: "Other admin", email: "a2@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "A3", name: "Inactive", email: "a3@test.invalid", role: "ADMIN", status: "INACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E2", name: "Coworker", email: "e2@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
    ]).returning("*");
    await db("employee_profiles").insert({ user_id: employee.id });
    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: db };
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    process.env.JWT_SECRET = "profile-notification-test-secret";
    const service = require("../src/services/employeeProfileService");

    const submissions = [
      ["PERSONAL", () => service.submitPersonalDetailsRequest({ userId: employee.id, personalDetails: { nationality: "Indian" } })],
      ["ADDRESS", () => service.submitAddressRequest({ userId: employee.id, addressData: {
        address_type: "PERMANENT", address_line_1: "Example", address_line_2: null,
        address_line_3: null, city: "City", district: null, state: "State", pincode: "600001", country: null,
      } })],
      ["EMERGENCY_CONTACT", () => service.submitEmergencyContactRequest({ userId: employee.id, contactData: {
        request_type: "CREATE", contact_name: "Contact", mobile_no: "9876543210",
      } })],
      ["FAMILY_MEMBER", () => service.submitFamilyMemberRequest({ userId: employee.id, familyMemberData: {
        request_type: "CREATE", name: "Member", relation: "Father", family_member_type: "FAMILY_MEMBER",
      } })],
      ["QUALIFICATION", () => service.submitQualificationRequest({ userId: employee.id, qualificationData: {
        request_type: "CREATE", qualification_type: "ACADEMIC", qualification: "Degree",
      } })],
      ["WORK_EXPERIENCE", () => service.submitWorkExperienceRequest({ userId: employee.id, experienceData: {
        request_type: "CREATE", previous_org_name: "Company", designation: "Engineer", from_date: "2020-01-01",
      } })],
      ["IDENTITY", () => service.submitIdentityDetailsRequest({ userId: employee.id, identityData: {
        request_type: "CREATE", aadhaar_number: "123456789012",
      } })],
      ["STATUTORY", () => service.submitStatutoryDetailsRequest({ userId: employee.id, statutoryData: {
        request_type: "CREATE", is_pf_eligible: false, is_esi_eligible: false,
      } })],
      ["BANK", () => service.submitBankDetailsRequest({ userId: employee.id, bankData: {
        request_type: "CREATE", bank_name: "Bank", account_number: "1234567890",
      } })],
    ];

    for (const [section, submit] of submissions) {
      await submit();
      const request = await db("employee_profile_change_requests").where({ user_id: employee.id, section }).first();
      assert.ok(request, section);
      const notifications = await db("notifications").where({ entity_type: "profile_change_request", entity_id: request.id });
      assert.equal(notifications.length, 2, section);
      assert.deepEqual(new Set(notifications.map((item) => String(item.user_id))),
        new Set([String(admin.id), String(secondAdmin.id)]));
      for (const notification of notifications) {
        assert.equal(notification.type, "PROFILE_CHANGE_REQUEST");
        assert.equal(String(notification.actor_id), String(employee.id));
        assert.equal(String(notification.data.request_id), String(request.id));
        assert.equal(notification.data.section, section);
        assert.equal(notification.data.request_type, request.request_type);
        assert.equal(notification.data.emp_code, employee.emp_code);
        assert.equal(notification.data.employee_name, employee.name);
        assert.equal(notification.is_read, false);
        assert.ok(await db("notification_push_jobs").where({ notification_id: notification.id }).first());
        assert.equal(JSON.stringify(notification).includes("1234567890"), false);
        assert.equal(JSON.stringify(notification).includes("9876543210"), false);
      }
    }

    await assert.rejects(submissions[0][1](), { code: "PERSONAL_REQUEST_ALREADY_PENDING" });
    assert.equal(Number((await db("notifications").count({ n: "*" }).first()).n), 18);
    assert.equal(Number((await db("notifications").whereIn("user_id", [employee.id, coworker.id, inactiveAdmin.id]).count({ n: "*" }).first()).n), 0);

    const express = require("express");
    const jwt = require("jsonwebtoken");
    const app = express();
    app.use("/api/v1/notifications", require("../src/routes/notificationRoutes"));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/notifications/admin/get-notifications`, {
      headers: { Authorization: `Bearer ${jwt.sign({ id: admin.id }, process.env.JWT_SECRET)}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.notifications.filter((item) => item.type === "PROFILE_CHANGE_REQUEST").length, 9);

    await db.raw(`CREATE FUNCTION reject_profile_notification() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'notification insert failed'; END; $$ LANGUAGE plpgsql`);
    await db.raw("CREATE TRIGGER reject_profile_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_profile_notification()");
    await assert.rejects(service.submitFamilyMemberRequest({ userId: employee.id, familyMemberData: {
      request_type: "CREATE", name: "Second", relation: "Mother", family_member_type: "FAMILY_MEMBER",
    } }), /notification insert failed/);
    assert.equal(Number((await db("employee_profile_change_requests").where({ section: "FAMILY_MEMBER" }).count({ n: "*" }).first()).n), 1);
    await assert.rejects(service.submitWorkExperienceRequest({ userId: coworker.id, experienceData: {
      request_type: "CREATE", previous_org_name: "Company", designation: "Engineer", from_date: "2020-01-01",
    } }), /notification insert failed/);
    assert.equal(Number((await db("employee_profile_change_requests")
      .where({ user_id: coworker.id }).count({ n: "*" }).first()).n), 0);
    assert.equal(Number((await db("notification_push_jobs").count({ n: "*" }).first()).n), 18);

    await db.raw("DROP TRIGGER reject_profile_notification ON notifications");
    await db("users").whereIn("id", [admin.id, secondAdmin.id]).update({ status: "INACTIVE" });
    await service.submitFamilyMemberRequest({ userId: coworker.id, familyMemberData: {
      request_type: "CREATE", name: "Member", relation: "Father", family_member_type: "FAMILY_MEMBER",
    } });
    assert.equal(Number((await db("employee_profile_change_requests")
      .where({ user_id: coworker.id }).count({ n: "*" }).first()).n), 1);
    assert.equal(Number((await db("notifications").count({ n: "*" }).first()).n), 18);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.IDENTITY_ENCRYPTION_KEY;
    else process.env.IDENTITY_ENCRYPTION_KEY = previousKey;
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
