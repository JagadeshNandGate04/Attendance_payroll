const cron = require("node-cron");
const { processCurrentMonthAttendance } = require("../services/attendanceCatchupService");

function startAttendanceCatchupWorker() {
  let running = null;
  function run() {
    if (running) return running;
    running = processCurrentMonthAttendance()
      .then((result) => console.log("Attendance catch-up completed:", result))
      .catch((error) => console.error("Attendance catch-up failed:", error))
      .finally(() => { running = null; });
    return running;
  }
  run();
  const task = cron.schedule("5 * * * *", run, {
    timezone: process.env.TIMEZONE || "Asia/Kolkata"
  });
  return async function stopAttendanceCatchupWorker() {
    task.stop();
    if (running) await running;
  };
}

module.exports = { startAttendanceCatchupWorker };
