const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");

test("employee bank details endpoint returns only masked approved details", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to an isolated PostgreSQL database",
}, async () => {
  const schema = `bank_test_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL });
  let db;
  let server;
  const originalSecret = process.env.JWT_SECRET;
  const originalKey = process.env.IDENTITY_ENCRYPTION_KEY;
  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL, searchPath: [schema] });
    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261104064126_create_notifications",
      "20261104092535_create_notification_push_jobs",
      "20261112043402_create_employee_sensitive_details",
      "20261112043402_create_employee_profile_approvals_and_documents",
    ]) await require(`../migrations/${migration}`).up(db);

    const [employee, other, admin, inactive] = await db("users").insert([
      { emp_code: "E1", name: "Employee", email: "e1@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E2", name: "Other", email: "e2@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "A1", name: "Admin", email: "a1@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E3", name: "Inactive", email: "e3@test.invalid", role: "EMPLOYEE", status: "INACTIVE", date_of_joining: "2020-01-01" },
    ]).returning("*");
    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true, exports: db,
    };
    process.env.JWT_SECRET = "bank-test-secret";
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const jwt = require("jsonwebtoken");
    const express = require("express");
    const service = require("../src/services/employeeProfileService");
    const { encryptValue } = require("../src/utils/encryption");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/employee-profile", require("../src/routes/employeeProfileRoutes"));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const url = `http://127.0.0.1:${server.address().port}/api/v1/employee-profile/me/bank-details`;
    async function get(id, query = "") {
      const response = await fetch(url + query, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
      });
      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: await response.json(),
      };
    }

    assert.equal((await get()).status, 401);
    assert.equal((await get(admin.id)).status, 403);
    assert.equal((await get(inactive.id)).status, 401);
    assert.deepEqual((await get(employee.id)).body.data, { bank_details: null });
    const submission = await service.submitBankDetailsRequest({
      userId: employee.id,
      bankData: {
        request_type: "CREATE", bank_name: "Bank", branch_name: "Branch",
        account_number: "1234567890", ifsc_code: "ABCD0123456",
      },
    });
    assert.deepEqual((await get(employee.id)).body.data, { bank_details: null });
    await service.approveBankDetailsRequest({ requestId: submission.data.request_id, adminId: admin.id });
    const result = await get(employee.id);
    assert.equal(result.status, 200);
    assert.equal(result.cacheControl, "no-store");
    const details = result.body.data.bank_details;
    assert.equal(details.bank_name, "Bank");
    assert.equal(details.branch_name, "Branch");
    assert.equal(details.ifsc_code, "ABCD0123456");
    assert.equal(details.account_number_available, true);
    assert.equal(details.account_number, "******7890");
    assert.ok(details.id);
    assert.ok(details.created_at);
    assert.equal(Object.hasOwn(details, "account_number_encrypted"), false);
    assert.equal(JSON.stringify(result.body).includes("1234567890"), false);
    assert.deepEqual((await get(other.id, `?user_id=${employee.id}`)).body.data, { bank_details: null });
    await db("employee_bank_details").insert({
      user_id: other.id, bank_name: "Other bank", account_number_encrypted: encryptValue("9876543210"),
    });
    const otherDetails = (await get(other.id, `?user_id=${employee.id}`)).body.data.bank_details;
    assert.equal(otherDetails.bank_name, "Other bank");
    assert.equal(otherDetails.account_number, "******3210");

    const update = await service.submitBankDetailsRequest({
      userId: employee.id, bankData: { request_type: "UPDATE", id: details.id, account_number: null },
    });
    assert.equal((await get(employee.id)).body.data.bank_details.account_number, "******7890");
    await service.approveBankDetailsRequest({ requestId: update.data.request_id, adminId: admin.id });
    const cleared = (await get(employee.id)).body.data.bank_details;
    assert.equal(cleared.account_number, null);
    assert.equal(cleared.account_number_available, false);

    const deletion = await service.submitBankDetailsRequest({
      userId: employee.id, bankData: { request_type: "DELETE", id: details.id },
    });
    await service.approveBankDetailsRequest({ requestId: deletion.data.request_id, adminId: admin.id });
    assert.deepEqual((await get(employee.id)).body.data, { bank_details: null });
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalKey === undefined) delete process.env.IDENTITY_ENCRYPTION_KEY;
    else process.env.IDENTITY_ENCRYPTION_KEY = originalKey;
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
