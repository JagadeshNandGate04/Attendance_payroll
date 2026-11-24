const cron = require("node-cron");
const { processBirthdays } = require("../services/birthdayNotificationService");

function startBirthdayNotificationWorker() {
  let running = null;
  function run() {
    if (running) return running;
    running = processBirthdays()
      .then((result) => console.log("Birthday notifications checked:", result))
      .catch((error) => console.error("Birthday notification check failed:", error))
      .finally(() => { running = null; });
    return running;
  }
  run();
  const task = cron.schedule("5 * * * *", run, {
    timezone: process.env.TIMEZONE || "Asia/Kolkata"
  });
  return async function stopBirthdayNotificationWorker() {
    task.stop();
    if (running) await running;
  };
}

module.exports = { startBirthdayNotificationWorker };
