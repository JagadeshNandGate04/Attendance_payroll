const knex = require("../config/database");
const { formatDateOnly } = require("../utils/dateHelpers");
const { getMonthRange } = require("../utils/attendanceUtils");
const { getLocalDateString, getLocalDayBounds } = require("../utils/attendanceStatus");
const { recomputeDay } = require("./AttendanceService");

async function ensureCompletedAttendance({
  trx, userId, year, month, asOfDate = getLocalDateString(), requireUnlocked = false
}) {
  const { startDate, endExclusive } = getMonthRange(year, month);
  const employee = await trx("users")
    .where({ id: userId })
    .select("id", "emp_code", "date_of_joining", "role", "status")
    .forUpdate()
    .first();
  if (!employee) throw new Error(`Employee ${userId} not found`);
  if (String(employee.role).toUpperCase() !== "EMPLOYEE" ||
      String(employee.status).toUpperCase() !== "ACTIVE") return 0;

  const finalized = await trx("payroll_runs")
    .where({ year, month, status: "FINALIZED" })
    .first("id");
  if (finalized) return 0;
  const lockedMonth = await trx("day_summaries")
    .where({ is_locked: true })
    .where("work_date", ">=", startDate)
    .where("work_date", "<", endExclusive)
    .first("id");
  if (lockedMonth) {
    if (requireUnlocked) {
      const error = new Error("Attendance month is locked; payroll cannot recalculate missing attendance");
      error.code = "INVALID_STATE";
      throw error;
    }
    return 0;
  }

  const joiningDate = formatDateOnly(employee.date_of_joining);
  if (!joiningDate) throw new Error(`Employee ${userId} has no joining date`);
  const firstDate = joiningDate > startDate ? joiningDate : startDate;
  const cursor = new Date(`${firstDate}T00:00:00Z`);
  const limit = endExclusive < asOfDate ? endExclusive : asOfDate;
  if (firstDate >= limit) return 0;

  const summaries = await trx("day_summaries")
    .select("id", "work_date", "status", "is_locked", "first_in", "last_out", "work_min", "needs_regularization")
    .where({ user_id: userId })
    .where("work_date", ">=", firstDate)
    .where("work_date", "<", limit)
    .forUpdate();
  const byDate = new Map(summaries.map((summary) => [formatDateOnly(summary.work_date), summary]));
  let created = 0;

  while (cursor.toISOString().slice(0, 10) < limit) {
    const date = cursor.toISOString().slice(0, 10);
    const summary = byDate.get(date);
    if (!summary) {
      await recomputeDay(userId, date, trx);
      created += 1;
    } else if (
      !summary.is_locked && ["ABSENT", "PRESENT", "UNINFORMED"].includes(summary.status) &&
      !summary.first_in && !summary.last_out &&
      Number(summary.work_min || 0) === 0 && !summary.needs_regularization
    ) {
      const { start, end } = getLocalDayBounds(date);
      const leave = await trx("leave_requests").where({ user_id: userId, status: "APPROVED" })
        .where("from_date", "<=", date).where("to_date", ">=", date).first("id");
      const rawPunch = await trx("raw_punches").where({ emp_code: employee.emp_code })
        .where("punched_at", ">=", start)
        .where("punched_at", "<", end).first("id");
      const correction = await trx("correction_punches").where({ user_id: userId, is_voided: false })
        .where("punched_at", ">=", start)
        .where("punched_at", "<", end).first("id");
      if (summary.status === "UNINFORMED" && (leave || rawPunch || correction)) {
        await recomputeDay(userId, date, trx);
      } else if (!leave && !rawPunch && !correction && summary.status !== "UNINFORMED") {
        if (summary.status === "ABSENT") {
          await trx("day_summaries").where({ id: summary.id })
            .update({ status: "UNINFORMED", updated_at: trx.fn.now() });
        } else {
          await recomputeDay(userId, date, trx);
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return created;
}

async function processCurrentMonthAttendance(asOfDate = getLocalDateString()) {
  const year = Number(asOfDate.slice(0, 4));
  const month = Number(asOfDate.slice(5, 7));
  const employees = await knex("users").select("id")
    .whereRaw("UPPER(role) = ?", ["EMPLOYEE"])
    .whereRaw("UPPER(status) = ?", ["ACTIVE"])
    .orderBy("id");
  let created = 0;
  let failed = 0;
  for (const employee of employees) {
    try {
      created += await knex.transaction((trx) => ensureCompletedAttendance({
        trx, userId: employee.id, year, month, asOfDate
      }));
    } catch (error) {
      failed += 1;
      console.error(`Attendance catch-up failed for employee ${employee.id}:`, error);
    }
  }
  return { employees: employees.length, created, failed };
}

module.exports = { ensureCompletedAttendance, processCurrentMonthAttendance };
