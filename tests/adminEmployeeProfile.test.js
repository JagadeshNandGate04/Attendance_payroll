const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const knexFactory = require("knex");

test("admin retrieves one employee profile and paginated profile requests", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to an isolated PostgreSQL database",
}, async () => {
  const schema = `admin_profile_test_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL });
  let db;
  let server;
  const pictureName = `test-${crypto.randomBytes(8).toString("hex")}.png`;
  const picturePath = path.join(__dirname, "../storage/private/profile-pictures", pictureName);
  const image = Buffer.from("89504e470d0a1a0a00000000", "hex");
  let pictureCreated = false;
  const previousSecret = process.env.JWT_SECRET;
  const previousKey = process.env.IDENTITY_ENCRYPTION_KEY;
  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL, searchPath: [schema] });
    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261112043401_create_employee_profiles",
      "20261112043402_create_employee_profile_details",
      "20261112043402_create_employee_sensitive_details",
      "20261112043402_create_employee_profile_approvals_and_documents",
      "20261113100620_create_employee_designation_history",
    ]) await require(`../migrations/${migration}`).up(db);

    await fs.mkdir(path.dirname(picturePath), { recursive: true });
    await fs.writeFile(picturePath, image, { flag: "wx" });
    pictureCreated = true;
    const [admin, employee, other, noProfile] = await db("users").insert([
      { emp_code: "ADM", name: "Admin", email: "adm@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E1", name: "Employee", email: "e1@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E2", name: "Other", email: "e2@test.invalid", role: "EMPLOYEE", status: "INACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "E3", name: "No profile", email: "e3@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
    ]).returning("*");
    await db("employee_profiles").insert([
      { user_id: employee.id, profile_picture_path: `profile-pictures/${pictureName}`, profile_picture_mime_type: "image/png", profile_picture_size_bytes: image.length },
      { user_id: other.id },
    ]);
    process.env.JWT_SECRET = "admin-profile-test-secret";
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const { encryptValue } = require("../src/utils/encryption");
    await db("employee_bank_details").insert({
      user_id: employee.id, bank_name: "Bank", account_number_encrypted: encryptValue("1234567890"),
    });
    await db("employee_profile_change_requests").insert([
      { user_id: employee.id, section: "PERSONAL", request_type: "UPDATE", status: "PENDING", requested_data: JSON.stringify({ nationality: "Indian" }) },
      { user_id: employee.id, section: "ADDRESS", request_type: "UPDATE", status: "APPROVED" },
      { user_id: employee.id, section: "BANK", request_type: "UPDATE", status: "REJECTED", requested_data: JSON.stringify({ account_number_encrypted: "secret-value" }) },
      { user_id: other.id, section: "PERSONAL", request_type: "UPDATE", status: "PENDING" },
    ]);
    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true, exports: db,
    };
    const express = require("express");
    const jwt = require("jsonwebtoken");
    const app = express();
    app.use("/api/v1/employee-profile", require("../src/routes/employeeProfileRoutes"));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/v1/employee-profile/admin/employees`;
    async function get(path, id) {
      const response = await fetch(base + path, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
      });
      return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
    }

    assert.equal((await get(`/${employee.id}`)).status, 401);
    assert.equal((await get(`/${employee.id}`, employee.id)).status, 403);
    assert.equal((await get("/bad", admin.id)).status, 400);
    assert.equal((await get(`/${employee.id}?page=0`, admin.id)).status, 400);
    assert.equal((await get("/99999999", admin.id)).status, 404);
    assert.equal((await get(`/${noProfile.id}`, admin.id)).status, 404);
    assert.equal((await get(`/${admin.id}`, admin.id)).status, 404);
    const result = await get(`/${employee.id}?limit=2`, admin.id);
    assert.equal(result.status, 200);
    assert.equal(result.cache, "private, no-store");
    assert.equal(String(result.body.data.employee.id), String(employee.id));
    assert.equal(result.body.data.bank_details.account_number, "******7890");
    assert.equal(result.body.data.pending_requests.length, 1);
    assert.equal(result.body.data.requests.length, 2);
    assert.deepEqual(result.body.data.requests_pagination, { page: 1, limit: 2, total: 3, total_pages: 2 });
    const second = await get(`/${employee.id}?limit=2&page=2`, admin.id);
    const requests = result.body.data.requests.concat(second.body.data.requests);
    assert.deepEqual(new Set(requests.map((request) => request.status)), new Set(["PENDING", "APPROVED", "REJECTED"]));
    assert.ok(requests.every((request) => String(request.user_id) === String(employee.id)));
    assert.equal(requests.find((request) => request.section === "BANK").requested_data.account_number_encrypted, "[REDACTED]");
    assert.equal(JSON.stringify(result.body).includes("1234567890"), false);
    assert.equal(JSON.stringify(result.body).includes("secret-value"), false);
    assert.equal(result.body.data.profile.profile_picture.url,
      `/api/v1/employee-profile/admin/employees/${employee.id}/profile-picture`);
    assert.equal((await get(`/${employee.id}/profile-picture`, employee.id)).status, 403);
    const picture = await fetch(`${base}/${employee.id}/profile-picture`, {
      headers: { Authorization: `Bearer ${jwt.sign({ id: admin.id }, process.env.JWT_SECRET)}` },
    });
    assert.equal(picture.status, 200);
    assert.equal(picture.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await picture.arrayBuffer()), image);
    assert.equal((await get(`/${other.id}/profile-picture`, admin.id)).status, 404);
    assert.equal((await get(`/${other.id}`, admin.id)).status, 200);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (pictureCreated) await fs.unlink(picturePath);
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.IDENTITY_ENCRYPTION_KEY;
    else process.env.IDENTITY_ENCRYPTION_KEY = previousKey;
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
