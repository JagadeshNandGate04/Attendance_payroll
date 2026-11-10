require("dotenv").config();

const knex = require("./src/config/database");
const attendanceService = require("./src/services/AttendanceService");
const records = [
  { userId: 3, date: "2026-11-03", employee: "EMP002" },
  { userId: 6, date: "2026-11-02", employee: "EMP003" },
  { userId: 6, date: "2026-11-03", employee: "EMP003" },
  { userId: 14, date: "2026-11-05", employee: "EMP011" },
];

async function run() {
  try {
    console.log("Starting historical LOP correction...\n");

    for (const record of records) {
      console.log(
        `Recomputing ${record.employee} - ${record.date}`
      );

      const result = await attendanceService.recomputeDay(
        record.userId,
        record.date
      );

      console.log({
        employee: record.employee,
        date: record.date,
        status: result.summary.status,
        work_min: result.summary.work_min,
        needs_regularization:
          result.summary.needs_regularization,
        calculated_lop: result.summary.lop_value,
      });

      console.log("--------------------------------");
    }

    console.log("\nHistorical LOP correction completed.");
  } catch (error) {
    console.error("Historical LOP correction failed:", error);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

run();
