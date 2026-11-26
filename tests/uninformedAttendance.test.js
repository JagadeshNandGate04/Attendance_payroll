const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const knexFactory = require("knex");
const { getLocalDateString, getLocalDayBounds } = require("../src/utils/attendanceStatus");

const connection = process.env.TEST_DATABASE_URL;

test("local attendance date boundaries use the configured time zone", () => {
  const { start, end } = getLocalDayBounds("2026-01-01");
  assert.equal(getLocalDateString(start), "2026-01-01");
  assert.equal(getLocalDateString(new Date(end.getTime() - 1)), "2026-01-01");
  assert.equal(getLocalDateString(end), "2026-01-02");
});

test("completed attendance, rejected leave and payroll integration", {
  skip: !connection && "Set TEST_DATABASE_URL to an isolated PostgreSQL database"
}, async () => {
  const schema = `attendance_test_${crypto.randomBytes(8).toString("hex")}`;
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
    ]) await require(`../migrations/${migration}`).up(db);

    const databasePath = require.resolve("../src/config/database");
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true, exports: db
    };
    const attendance = require("../src/services/AttendanceService");
    const leave = require("../src/services/LeaveService");
    const payroll = require("../src/services/PayrollService");
    const { ensureCompletedAttendance, processCurrentMonthAttendance } =
      require("../src/services/attendanceCatchupService");

    const today = getLocalDateString();
    const [currentYear, currentMonth] = today.split("-").map(Number);
    const previous = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
    const year = previous.getUTCFullYear();
    const month = previous.getUTCMonth() + 1;
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const date = (day) => `${prefix}-${String(day).padStart(2, "0")}`;
    const [admin, employee] = await db("users").insert([
      { emp_code: "ADM", name: "Admin", email: "adm@test.invalid", role: "ADMIN", status: "ACTIVE", date_of_joining: "2020-01-01" },
      { emp_code: "EMP", name: "Employee", email: "emp@test.invalid", role: "EMPLOYEE", status: "ACTIVE", date_of_joining: date(24) }
    ]).returning("*");
    await db("settings").insert({ key: "weekly_off_days", value: JSON.stringify([]) });
    await db("salary_structures").insert({
      user_id: employee.id, basic: 30000, gross: 30000, effective_from: date(24)
    });
    await db("leave_ledger").insert({
      user_id: employee.id, entry_date: date(24), delta: 9, type: "ACCRUAL"
    });

    const rejected = await leave.applyMyLeave({
      userId: employee.id, fromDate: date(25), toDate: date(25), reason: "Emergency"
    });
    await leave.decideAdminLeave({
      adminId: admin.id, leaveRequestId: rejected.data.leave_request.id,
      action: "REJECT", note: "Insufficient coverage"
    });
    const employeeNotification = await db("notifications")
      .where({ user_id: employee.id, type: "LEAVE_REJECTED" }).first();
    assert.match(employeeNotification.message, /Insufficient coverage/);
    assert.equal(employeeNotification.data.decision_note, "Insufficient coverage");
    assert.ok(await db("notification_push_jobs").where({ notification_id: employeeNotification.id }).first());
    const requests = await leave.getMyLeaveRequests({ userId: employee.id, month, year });
    assert.equal(requests.data.leave_requests[0].decision_note, "Insufficient coverage");

    const approved = await leave.applyMyLeave({
      userId: employee.id, fromDate: date(26), toDate: date(26), reason: "Planned"
    });
    await leave.decideAdminLeave({
      adminId: admin.id, leaveRequestId: approved.data.leave_request.id, action: "APPROVE", note: "OK"
    });
    await leave.applyMyLeave({
      userId: employee.id, fromDate: date(28), toDate: date(28), reason: "Pending"
    });
    const { start } = getLocalDayBounds(date(27));
    await db("correction_punches").insert([
      { user_id: employee.id, punched_at: start, direction: "IN", source: "ADMIN", created_by: admin.id, reason: "test" },
      { user_id: employee.id, punched_at: new Date(start.getTime() + 4 * 3600000), direction: "OUT", source: "ADMIN", created_by: admin.id, reason: "test" }
    ]);
    await db("day_summaries").insert({
      user_id: employee.id, work_date: date(24), status: "ABSENT", lop_value: 2, is_locked: false
    });
    await attendance.adjustAttendanceLop({
      actorId: admin.id, userId: employee.id, workDate: date(24), newLop: 0.5, reason: "Reviewed"
    });
    await db.transaction((trx) => ensureCompletedAttendance({ trx, userId: employee.id, year, month }));
    let rows = await db("day_summaries").where({ user_id: employee.id }).orderBy("work_date");
    const byDate = new Map(rows.map((row) => [require("../src/utils/dateHelpers").formatDateOnly(row.work_date), row]));
    assert.equal(byDate.get(date(24)).status, "UNINFORMED");
    assert.equal(byDate.get(date(25)).status, "UNINFORMED");
    assert.equal(Number(byDate.get(date(25)).lop_value), 2);
    assert.equal(byDate.get(date(26)).status, "LEAVE");
    assert.equal(byDate.get(date(27)).status, "HALF_DAY");
    assert.equal(Number(byDate.get(date(27)).lop_value), 0.5);
    assert.equal(byDate.get(date(28)).status, "UNINFORMED");
    assert.equal(byDate.has(date(23)), false);
    assert.equal((await attendance.getMyAttendanceDay({ userId: employee.id, date: date(24) })).data.summary.lop_value, 0.5);
    const monthly = await attendance.getAdminMonthlyAttendance({ userId: employee.id, month, year });
    assert.equal(monthly.data.days.find((day) => day.date === date(24)).lop_value, 0.5);
    assert.equal(monthly.data.days.find((day) => day.date === date(27)).corrections.length, 2);
    const daily = await attendance.getAdminDailyAttendance({ date: date(24) });
    const employeeDay = daily.data.employees.find((day) => String(day.user_id) === String(employee.id));
    assert.equal(employeeDay.status, "UNINFORMED");
    assert.equal(employeeDay.lop_value, 0.5);

    const draft = await payroll.createPayrollRun({ adminId: admin.id, month, year });
    const runId = draft.data.payroll_run.id;
    const details = await payroll.getPayrollRunById({ payrollRunId: runId });
    const lopDetail = details.data.payroll_items[0].lop_dates.find((day) => day.work_date === date(24));
    assert.equal(lopDetail.lop_value, "0.50");
    await attendance.adjustAttendanceLop({
      actorId: admin.id, userId: employee.id, workDate: date(25), newLop: 1, reason: "Reviewed"
    });
    await assert.rejects(() => payroll.finalizePayrollRun({ adminId: admin.id, payrollRunId: runId }),
      /recompute the payroll run/);
    await payroll.recomputePayrollRun({ adminId: admin.id, payrollRunId: runId });
    const updated = await payroll.getPayrollRunById({ payrollRunId: runId });
    assert.equal(updated.data.payroll_items[0].lop_dates.find((day) => day.work_date === date(25)).lop_value, "1.00");

    const latePunch = getLocalDayBounds(date(25)).start;
    await db("correction_punches").insert([
      { user_id: employee.id, punched_at: latePunch, direction: "IN", source: "ADMIN", created_by: admin.id, reason: "Late arrival data" },
      { user_id: employee.id, punched_at: new Date(latePunch.getTime() + 8 * 3600000), direction: "OUT", source: "ADMIN", created_by: admin.id, reason: "Late arrival data" }
    ]);
    await db.transaction((trx) => ensureCompletedAttendance({ trx, userId: employee.id, year, month }));
    const worked = await db("day_summaries").where({ user_id: employee.id, work_date: date(25) }).first();
    assert.equal(worked.status, "PRESENT");
    assert.equal(Number(worked.lop_value), 0);
    assert.equal((await attendance.getMyAttendanceDay({ userId: employee.id, date: date(25) })).data.summary.lop_adjustment, null);

    const currentDraft = await db("payroll_runs")
      .insert({ month: currentMonth, year: currentYear, status: "DRAFT" }).returning("*");
    await assert.rejects(() => payroll.finalizePayrollRun({ adminId: admin.id, payrollRunId: currentDraft[0].id }),
      /after the month ends/);

    await processCurrentMonthAttendance();
    rows = await db("day_summaries").where({ user_id: employee.id });
    assert.equal(rows.some((row) => require("../src/utils/dateHelpers").formatDateOnly(row.work_date) === today), false);
    const count = rows.length;
    await processCurrentMonthAttendance();
    assert.equal((await db("day_summaries").where({ user_id: employee.id })).length, count);
    await db("day_summaries").where({ user_id: employee.id, work_date: date(24) }).update({ is_locked: true });
    await assert.rejects(() => db.transaction((trx) => ensureCompletedAttendance({
      trx, userId: employee.id, year, month, requireUnlocked: true
    })), { code: "INVALID_STATE" });
    assert.equal(await db.transaction((trx) => ensureCompletedAttendance({
      trx, userId: employee.id, year, month
    })), 0);

    await db("payroll_runs").where({ id: runId }).update({ status: "FINALIZED" });
    const lockedBefore = await db("day_summaries")
      .where({ user_id: employee.id, work_date: date(24) }).first();
    const punchStart = getLocalDayBounds(date(24)).start;
    await db("raw_punches").insert([
      { emp_code: employee.emp_code, punched_at: punchStart, direction: "IN" },
      { emp_code: employee.emp_code, punched_at: new Date(punchStart.getTime() + 60000), direction: "IN" },
      { emp_code: admin.emp_code, punched_at: punchStart, direction: "IN" },
    ]);
    await db("correction_punches").insert([
      { user_id: employee.id, punched_at: new Date(punchStart.getTime() + 8 * 3600000), direction: "OUT", source: "ADMIN_MANUAL", created_by: admin.id, reason: "Test" },
      { user_id: employee.id, punched_at: new Date(punchStart.getTime() + 9 * 3600000), direction: "IN", source: "ADMIN_MANUAL", created_by: admin.id, reason: "Voided", is_voided: true },
    ]);
    const employeeMonth = await attendance.getMyAttendance({ userId: employee.id, month, year });
    const day = employeeMonth.data.day_summaries.find((item) => item.work_date === date(24));
    assert.deepEqual(day.punches.map((punch) => [punch.direction, punch.source_type]), [
      ["IN", "RAW"], ["OUT", "CORRECTION"]
    ]);
    assert.equal(day.status, lockedBefore.status);
    assert.equal(day.lop_value, 0.5);
    assert.deepEqual(await db("day_summaries")
      .where({ user_id: employee.id, work_date: date(24) }).first(), lockedBefore);
    const employeeDayDetail = await attendance.getMyAttendanceDay({ userId: employee.id, date: date(24) });
    assert.deepEqual(day.punches, employeeDayDetail.data.punches);

    const todayBounds = getLocalDayBounds(today);
    await db("raw_punches").insert([
      { emp_code: employee.emp_code, punched_at: todayBounds.start, direction: "IN" },
      { emp_code: employee.emp_code, punched_at: todayBounds.end, direction: "IN" },
    ]);
    const currentAttendance = await attendance.getMyAttendance({
      userId: employee.id, month: currentMonth, year: currentYear,
    });
    const todaySummary = currentAttendance.data.day_summaries.find((item) => item.work_date === today);
    assert.equal(todaySummary.punches.length, 1);
    assert.equal(todaySummary.punches[0].direction, "IN");
    assert.equal(todaySummary.is_pending, true);
    assert.equal(currentAttendance.data.today.status, "IN");
    assert.equal(currentAttendance.data.today.last_punch.id, todaySummary.punches[0].id);
    assert.equal(currentAttendance.data.day_summaries.at(-1).work_date, today);
  } finally {
    if (db) await db.destroy();
    await adminDb.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [schema]);
    await adminDb.destroy();
  }
});
