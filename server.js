
require("dotenv").config();

const app = require("./src/app");
const knex = require("./src/config/database");

const {
  startNotificationPushWorker
} = require("./src/workers/notificationPushWorker");

const {
  startLeaveAccrualWorker
} = require("./src/workers/leaveAccrualWorker");

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || "development";

let stopPushWorker = null;
let stopLeaveAccrualWorker = null;
let isShuttingDown = false;

// START EXPRESS SERVER


const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("\n===========================================");
  console.log("🚀 Human Resource Backend");
  console.log("===========================================");
  console.log(`Environment : ${NODE_ENV.toUpperCase()}`);
  console.log(`Port        : ${PORT}`);
  console.log(`Local       : http://localhost:${PORT}`);
  console.log(`Network     : http://0.0.0.0:${PORT}`);
  console.log("Server is running...");
  console.log("===========================================\n");

  // Start notification push worker.
  stopPushWorker = startNotificationPushWorker();

  // Start monthly leave accrual and annual reset worker.
  stopLeaveAccrualWorker = startLeaveAccrualWorker();
});

server.on("error", (error) => {
  console.error("Server startup error:", error);
});

// GRACEFUL SHUTDOWN


async function shutdown(signal) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`${signal} received. Closing server...`);

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log("HTTP Server Closed");

    if (stopPushWorker) {
      await stopPushWorker();
    }

    console.log("Notification Push Worker Closed");

    if (stopLeaveAccrualWorker) {
      await stopLeaveAccrualWorker();
    }

    console.log("Leave Accrual Worker Closed");

    await knex.destroy();

    console.log("Database Connection Closed");

    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);
    process.exit(1);
  }
}

// PROCESS SIGNALS

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));
