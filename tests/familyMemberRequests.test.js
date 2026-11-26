const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");

test("family member partial updates preserve the stored date through approval", async () => {
  const sql = knexFactory({ client: "pg" });
  const member = {
    id: "1",
    user_id: "10",
    name: "Nagarajan",
    relation: "Father",
    gender: null,
    date_of_birth: "1960-02-29",
    profession: null,
    family_member_type: "FAMILY_MEMBER",
    address: null,
    remarks: null,
    status: "ACTIVE",
  };
  const requests = [];
  let nextId = 1;

  function trx(table) {
    let conditions = {};
    let operation;
    let values;
    const query = {
      select() { return this; },
      whereRaw() { return this; },
      where(data) { conditions = { ...conditions, ...data }; return this; },
      forUpdate() { return this; },
      first(...columns) {
        const matches = (row) => Object.entries(conditions)
          .every(([key, value]) => String(row[key]) === String(value));
        if (table === "users") {
          return Promise.resolve(conditions.id === "10"
            ? { id: "10", name: "Employee", emp_code: "EMP" } : undefined);
        }
        if (table === "employee_family_members") {
          if (!matches(member)) return Promise.resolve(undefined);
          const textDate = columns.some((column) =>
            typeof column !== "string" &&
            column.toSQL().sql === "to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth"
          );
          return Promise.resolve({
            ...member,
            date_of_birth: member.date_of_birth && !textDate
              ? new Date(`${member.date_of_birth}T00:00:00`)
              : member.date_of_birth,
          });
        }
        return Promise.resolve(requests.find(matches));
      },
      insert(data) { operation = "insert"; values = data; return this; },
      update(data) { operation = "update"; values = data; return this; },
      returning() {
        if (table === "employee_profile_change_requests" && operation === "insert") {
          const request = { ...values, id: String(nextId++) };
          requests.push(request);
          return Promise.resolve([request]);
        }
        if (table === "employee_profile_change_requests" && operation === "update") {
          const request = requests.find((item) => item.id === conditions.id);
          Object.assign(request, values);
          return Promise.resolve([request]);
        }
        throw new Error(`Unexpected returning operation: ${table} ${operation}`);
      },
      then(resolve, reject) {
        if (table === "users" && !operation) {
          return Promise.resolve([]).then(resolve, reject);
        }
        if (table !== "employee_family_members" || operation !== "update") {
          return Promise.reject(new Error(`Unexpected query: ${table} ${operation}`))
            .then(resolve, reject);
        }
        Object.assign(member, values);
        return Promise.resolve(1).then(resolve, reject);
      },
    };
    return query;
  }
  trx.raw = sql.raw.bind(sql);
  trx.fn = { now: () => "now" };
  const database = { transaction: (callback) => callback(trx) };
  const databasePath = require.resolve("../src/config/database");
  const servicePath = require.resolve("../src/services/employeeProfileService");
  const previousDatabase = require.cache[databasePath];
  const previousService = require.cache[servicePath];
  require.cache[databasePath] = {
    id: databasePath, filename: databasePath, loaded: true, exports: database,
  };
  delete require.cache[servicePath];

  try {
    const service = require(servicePath);
    async function submit(data) {
      return service.submitFamilyMemberRequest({ userId: "10", familyMemberData: data });
    }
    async function approve(request) {
      return service.approveFamilyMemberRequest({
        requestId: request.request.id, adminId: "20",
      });
    }

    const update = await submit({ request_type: "UPDATE", id: "1", name: "Nagarajan M" });
    assert.equal(member.name, "Nagarajan");
    const stored = requests[0];
    assert.equal(JSON.parse(stored.existing_data).date_of_birth, "1960-02-29");
    assert.equal(JSON.parse(stored.requested_data).date_of_birth, "1960-02-29");
    assert.equal(JSON.parse(stored.requested_data).name, "Nagarajan M");
    await assert.rejects(
      submit({ request_type: "UPDATE", id: "1", name: "Another name" }),
      { code: "FAMILY_MEMBER_REQUEST_ALREADY_PENDING" }
    );
    await approve(update);
    assert.equal(member.name, "Nagarajan M");
    assert.equal(member.date_of_birth, "1960-02-29");

    await assert.rejects(
      submit({ request_type: "UPDATE", id: "1", date_of_birth: "1960-02-30" }),
      { code: "INVALID_FAMILY_MEMBER_FIELD_VALUE" }
    );
    await assert.rejects(
      submit({ request_type: "UPDATE", id: "1", date_of_birth: "29-02-1960" }),
      { code: "INVALID_FAMILY_MEMBER_FIELD_VALUE" }
    );
    await assert.rejects(
      submit({ request_type: "UPDATE", id: "1", date_of_birth: "9999-12-31" }),
      { code: "INVALID_FAMILY_MEMBER_FIELD_VALUE" }
    );
    await assert.rejects(
      submit({ request_type: "UPDATE", id: "1" }),
      { code: "EMPTY_FAMILY_MEMBER_DATA" }
    );
    const clear = await submit({ request_type: "UPDATE", id: "1", date_of_birth: null });
    await approve(clear);
    assert.equal(member.date_of_birth, null);
    const nullDateUpdate = await submit({ request_type: "UPDATE", id: "1", name: "New name" });
    assert.equal(JSON.parse(requests.at(-1).requested_data).date_of_birth, null);
    await approve(nullDateUpdate);
    assert.equal(member.name, "New name");

    const newDate = await submit({ request_type: "UPDATE", id: "1", date_of_birth: "1959-12-31" });
    await approve(newDate);
    assert.equal(member.date_of_birth, "1959-12-31");

    const deletion = await submit({ request_type: "DELETE", id: "1" });
    assert.equal(JSON.parse(requests.at(-1).existing_data).date_of_birth, "1959-12-31");
    await approve(deletion);
    assert.equal(member.status, "INACTIVE");
  } finally {
    if (previousDatabase) require.cache[databasePath] = previousDatabase;
    else delete require.cache[databasePath];
    if (previousService) require.cache[servicePath] = previousService;
    else delete require.cache[servicePath];
    await sql.destroy();
  }
});

test("family member partial update against PostgreSQL", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to an isolated PostgreSQL database",
}, async () => {
  const schema = `family_test_${crypto.randomBytes(8).toString("hex")}`;
  const adminDb = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL });
  let db;
  const databasePath = require.resolve("../src/config/database");
  const servicePath = require.resolve("../src/services/employeeProfileService");
  const previousDatabase = require.cache[databasePath];
  const previousService = require.cache[servicePath];

  try {
    await adminDb.raw("CREATE SCHEMA ??", [schema]);
    db = knexFactory({ client: "pg", connection: process.env.TEST_DATABASE_URL, searchPath: [schema] });
    for (const migration of [
      "20260817104609_create_initial_schema",
      "20261104064126_create_notifications",
      "20261104092535_create_notification_push_jobs",
      "20261112043402_create_employee_profile_details",
      "20261112043402_create_employee_profile_approvals_and_documents",
    ]) await require(`../migrations/${migration}`).up(db);

    const [employee, admin] = await db("users").insert([
      { emp_code: "EMP", name: "Employee", email: "emp@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "ADM", name: "Admin", email: "adm@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
    ]).returning("*");
    const [member] = await db("employee_family_members").insert({
      user_id: employee.id, name: "Nagarajan", relation: "Father",
      date_of_birth: "1960-02-29", family_member_type: "FAMILY_MEMBER", status: "ACTIVE",
    }).returning("*");
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true, exports: db,
    };
    delete require.cache[servicePath];
    const service = require(servicePath);
    const submission = await service.submitFamilyMemberRequest({
      userId: employee.id,
      familyMemberData: { request_type: "UPDATE", id: member.id, name: "Nagarajan M" },
    });
    const request = await db("employee_profile_change_requests").where({ id: submission.request.id }).first();
    assert.equal(request.existing_data.date_of_birth, "1960-02-29");
    assert.equal(request.requested_data.date_of_birth, "1960-02-29");
    assert.equal(request.requested_data.name, "Nagarajan M");
    await service.approveFamilyMemberRequest({ requestId: request.id, adminId: admin.id });
    const updated = await db("employee_family_members").where({ id: member.id })
      .first("name", db.raw("date_of_birth::text AS date_of_birth"));
    assert.deepEqual(updated, { name: "Nagarajan M", date_of_birth: "1960-02-29" });
  } finally {
    if (previousDatabase) require.cache[databasePath] = previousDatabase;
    else delete require.cache[databasePath];
    if (previousService) require.cache[servicePath] = previousService;
    else delete require.cache[servicePath];
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
