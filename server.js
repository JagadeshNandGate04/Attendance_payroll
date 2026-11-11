
require("dotenv").config();

const app = require("./src/app");
const knex = require("./src/config/database");

const {
  startNotificationPushWorker,
} = require("./src/workers/notificationPushWorker");

const {
  startLeaveAccrualWorker,
} = require("./src/workers/leaveAccrualWorker");

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || "development";

let server = null;

let stopPushWorker = null;
let stopLeaveAccrualWorker = null;

let isShuttingDown = false;

// =====================================================
// START WORKERS
// =====================================================

function startWorkers() {
  console.log("\nStarting background workers...");

  stopPushWorker = startNotificationPushWorker();

  console.log("Notification Push Worker Started");

  stopLeaveAccrualWorker = startLeaveAccrualWorker();

  console.log("Leave Accrual Worker Started");
}

// =====================================================
// STOP WORKERS
// =====================================================

async function stopWorkers() {
  if (stopPushWorker) {
    try {
      await stopPushWorker();
      console.log("Notification Push Worker Closed");
    } catch (error) {
      console.error(
        "Notification Push Worker shutdown error:",
        error
      );
    }

    stopPushWorker = null;
  }

  if (stopLeaveAccrualWorker) {
    try {
      await stopLeaveAccrualWorker();
      console.log("Leave Accrual Worker Closed");
    } catch (error) {
      console.error(
        "Leave Accrual Worker shutdown error:",
        error
      );
    }

    stopLeaveAccrualWorker = null;
  }
}

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
  try {
    // Check database connection before starting HTTP server.

    await knex.raw("SELECT 1");

    console.log("Database connection established");

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log("\n===========================================");
      console.log("Human Resource Backend");
      console.log("===========================================");
      console.log(`Environment : ${NODE_ENV.toUpperCase()}`);
      console.log(`Port        : ${PORT}`);
      console.log(`Local       : http://localhost:${PORT}`);
      console.log(`Network     : http://0.0.0.0:${PORT}`);
      console.log("Server is running...");
      console.log("===========================================\n");
    });

    // Handle server startup errors.

    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    // Start background workers only after HTTP server is ready.

    startWorkers();

  } catch (error) {
    console.error("Application startup failed:", error);

    await stopWorkers();

    if (server && server.listening) {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }

    await knex.destroy();

    process.exit(1);
  }
}

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown(signal) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`\n${signal} received. Shutting down...`);

  try {
    // Stop background workers first.

    await stopWorkers();

    // Close HTTP server.

    if (server && server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log("HTTP Server Closed");
    }

    // Close database connection.

    await knex.destroy();

    console.log("Database Connection Closed");

    console.log("Application shutdown completed.");

    if (signal === "SIGUSR2") {
      process.kill(process.pid, "SIGUSR2");
      return;
    }

    process.exit(0);

  } catch (error) {
    console.error("Shutdown error:", error);

    process.exit(1);
  }
}

// =====================================================
// PROCESS SIGNALS
// =====================================================

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));

process.once("SIGUSR2", () => shutdown("SIGUSR2"));

// =====================================================
// START APPLICATION
// =====================================================

startServer();
