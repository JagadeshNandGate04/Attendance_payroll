
require("dotenv").config();

const knex = require("../src/config/database");
const { recomputeDay } = require("../src/services/attendanceService");

const DEVICE_ID = 2;
const START_DATE = "2026-10-01";
const END_DATE = "2026-10-30";

const TODAY_SCENARIOS = {
  EMP001: "FULL",
  EMP002: "LEAVE",
  EMP003: "ABSENT",
  EMP004: "LATE_FULL",
  EMP0043: "HALF",
  EMP0043333: "MISSING_OUT",
  EMP0044: "MISSING_IN",
  EMP005: "FULL",
  EMP006: "FULL",
  EMP007: "ABSENT",
  EMP008: "FULL",
  EMP009: "HALF",
  EMP017: "FULL",
  EMP102: "ABSENT",
};

const HISTORICAL_SCENARIOS = [
  "FULL",
  "LATE_FULL",
  "HALF",
  "MISSING_OUT",
  "MISSING_IN",
  "ABSENT",
];

// Convert PostgreSQL date values into YYYY-MM-DD.
function formatDateOnly(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDates() {
  const dates = [];
  let current = START_DATE;

  while (current <= END_DATE) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function getWeekday(dateString) {
  return new Date(`${dateString}T00:00:00Z`).getUTCDay();
}

function getScenario(employee, date, employeeIndex) {
  if (date === END_DATE) {
    return TODAY_SCENARIOS[employee.emp_code] || "ABSENT";
  }

  const dayNumber = Number(date.slice(-2));

  const scenarioIndex =
    (dayNumber + employeeIndex) % HISTORICAL_SCENARIOS.length;

  return HISTORICAL_SCENARIOS[scenarioIndex];
}

function getPunchTimes(date, scenario) {
  const punches = [];

  function add(direction, time) {
    punches.push({
      direction,
      punched_at: `${date}T${time}:00+05:30`,
    });
  }

  switch (scenario) {
    case "FULL":
      add("IN", "09:00");
      add("OUT", "13:00");
      add("IN", "14:00");
      add("OUT", "18:00");
      break;

    case "LATE_FULL":
      add("IN", "09:20");
      add("OUT", "13:20");
      add("IN", "14:20");
      add("OUT", "18:20");
      break;

    case "HALF":
      add("IN", "09:00");
      add("OUT", "13:00");
      break;

    case "MISSING_OUT":
      add("IN", "09:00");
      break;

    case "MISSING_IN":
      add("OUT", "18:00");
      break;

    case "ABSENT":
    case "LEAVE":
      break;

    default:
      throw new Error(`Unknown attendance scenario: ${scenario}`);
  }

  return punches;
}

async function ensureApprovedTestLeave(trx, employee, date) {
  const existingLeave = await trx("leave_requests")
    .where("user_id", employee.id)
    .where("status", "APPROVED")
    .where("from_date", "<=", date)
    .where("to_date", ">=", date)
    .first();

  if (existingLeave) {
    return false;
  }

  await trx("leave_requests").insert({
    user_id: employee.id,
    from_date: date,
    to_date: date,
    days: 1,
    reason: "TEST DATA - October dashboard validation",
    is_retroactive: false,
    status: "APPROVED",
    decided_at: new Date(),
    decision_note: "Approved test leave for dashboard validation",
  });

  return true;
}

async function main() {
  let insertedPunches = 0;
  let processedDays = 0;
  let skippedDays = 0;
  let skippedBeforeJoining = 0;
  let createdLeaves = 0;

  try {
    console.log("Starting October 2026 attendance test-data generation...");
    console.log(`Period: ${START_DATE} to ${END_DATE}`);
    console.log(`Test device ID: ${DEVICE_ID}`);

    // Verify test device.
    const device = await knex("devices")
      .where({
        id: DEVICE_ID,
        is_active: true,
      })
      .first();

    if (!device) {
      throw new Error(
        `Active test attendance device ID ${DEVICE_ID} was not found.`
      );
    }

    // Force PostgreSQL to return joining dates as YYYY-MM-DD strings.
    const employees = await knex("users")
      .select(
        "id",
        "emp_code",
        "name",
        knex.raw(
          "TO_CHAR(date_of_joining, 'YYYY-MM-DD') AS date_of_joining"
        )
      )
      .where({
        role: "EMPLOYEE",
        status: "ACTIVE",
      })
      .orderBy("emp_code", "asc");

    if (!employees.length) {
      throw new Error("No active employees found.");
    }

    console.log(`Found ${employees.length} active employees.`);

    const dates = getDates();

    console.log(`Total dates in period: ${dates.length}`);

    for (
      let employeeIndex = 0;
      employeeIndex < employees.length;
      employeeIndex++
    ) {
      const employee = employees[employeeIndex];

      const joiningDate = formatDateOnly(employee.date_of_joining);

      console.log(
        `\nProcessing ${employee.emp_code} - ${employee.name}`
      );

      console.log(`Joining date: ${joiningDate || "Not specified"}`);

      for (const date of dates) {
        // Do not create attendance before the employee joined.
        if (joiningDate && date < joiningDate) {
          skippedBeforeJoining++;
          continue;
        }

        await knex.transaction(async (trx) => {
          // Preserve existing summaries. Never overwrite them.
          const existingSummary = await trx("day_summaries")
            .where({
              user_id: employee.id,
              work_date: date,
            })
            .first();

          if (existingSummary) {
            skippedDays++;
            return;
          }

          // Existing attendance service handles weekly-off classification.
          const isWeekend = [0, 6].includes(getWeekday(date));

          const scenario = isWeekend
            ? "ABSENT"
            : getScenario(employee, date, employeeIndex);

          // Create approved leave for the designated test scenario.
          if (scenario === "LEAVE") {
            const created = await ensureApprovedTestLeave(
              trx,
              employee,
              date
            );

            if (created) {
              createdLeaves++;
            }
          }

          const punches = isWeekend
            ? []
            : getPunchTimes(date, scenario);

          // Insert raw punches without duplicating existing punches.
          for (const punch of punches) {
            const result = await trx("raw_punches")
              .insert({
                device_id: DEVICE_ID,
                emp_code: employee.emp_code,
                punched_at: punch.punched_at,
                direction: punch.direction,
                verify_mode: "TEST",
                raw_payload: JSON.stringify({
                  source: "OCTOBER_2026_DASHBOARD_TEST",
                  scenario,
                }),
              })
              .onConflict([
                "device_id",
                "emp_code",
                "punched_at",
              ])
              .ignore()
              .returning("id");

            if (Array.isArray(result) && result.length > 0) {
              insertedPunches += result.length;
            }
          }

          // Generate attendance sessions and summary using existing logic.
          await recomputeDay(employee.id, date, trx);

          processedDays++;
        });
      }
    }

    console.log("\n====================================");
    console.log("OCTOBER TEST DATA GENERATION COMPLETE");
    console.log("====================================");
    console.log(`Employees: ${employees.length}`);
    console.log(`Raw punches inserted: ${insertedPunches}`);
    console.log(`Attendance days processed: ${processedDays}`);
    console.log(`Existing summaries skipped: ${skippedDays}`);
    console.log(`Dates skipped before joining: ${skippedBeforeJoining}`);
    console.log(`Approved test leaves created: ${createdLeaves}`);
    console.log("====================================");

  } catch (error) {
    console.error("\nAttendance test-data generation failed:");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

main();
