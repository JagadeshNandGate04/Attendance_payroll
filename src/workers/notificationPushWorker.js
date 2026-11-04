
const knex = require("../config/database");

const {
  sendPushNotification,
} = require("../services/NotificationPushService");

// =====================================================
// CONFIGURATION
// =====================================================

const POLL_INTERVAL_MS = 5000;

const BATCH_SIZE = 10;

const MAX_ATTEMPTS = 5;

const BASE_RETRY_DELAY_SECONDS = 30;

const MAX_RETRY_DELAY_SECONDS = 1800;

const STALE_JOB_MINUTES = 10;

// =====================================================
// CLAIM PENDING JOBS
// PostgreSQL SKIP LOCKED prevents two workers
// from claiming the same job.
// =====================================================

async function claimPendingJobs() {
  return knex.transaction(async (trx) => {
    const now = new Date();

    const staleBefore = new Date(
      Date.now() - STALE_JOB_MINUTES * 60 * 1000
    );

    // Recover jobs left in PROCESSING after a worker crash.
    await trx("notification_push_jobs")
      .where("status", "PROCESSING")
      .where("updated_at", "<", staleBefore)
      .where("attempts", "<", MAX_ATTEMPTS)
      .update({
        status: "PENDING",
        next_attempt_at: now,
        last_error: "Recovered stale processing job.",
        updated_at: now,
      });

    // Stale jobs that already exhausted their attempts
    await trx("notification_push_jobs")
      .where("status", "PROCESSING")
      .where("updated_at", "<", staleBefore)
      .where("attempts", ">=", MAX_ATTEMPTS)
      .update({
        status: "FAILED",
        last_error: "Maximum attempts reached after worker interruption.",
        updated_at: now,
      });

    // Lock available jobs
    const jobs = await trx("notification_push_jobs")
      .select("id")
      .where("status", "PENDING")
      .where("next_attempt_at", "<=", now)
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(BATCH_SIZE);

    if (!jobs.length) {
      return [];
    }

    const jobIds = jobs.map((job) => job.id);

    // Mark jobs as PROCESSING and increment attempts
    const claimedJobs = await trx("notification_push_jobs")
      .whereIn("id", jobIds)
      .update({
        status: "PROCESSING",
        attempts: trx.raw("?? + 1", ["attempts"]),
        updated_at: now,
      })
      .returning(["id", "attempts"]);

    return claimedJobs;
  });
}

// =====================================================
// GET NOTIFICATION DETAILS
// =====================================================

async function getJobDetails(jobId) {
  return knex("notification_push_jobs as jobs")
    .join(
      "notifications as n",
      "n.id",
      "jobs.notification_id"
    )
    .join(
      "users as u",
      "u.id",
      "jobs.user_id"
    )
    .select(
      "jobs.id as job_id",
      "jobs.attempts",
      "jobs.user_id",

      "n.id as notification_id",
      "n.type",
      "n.title",
      "n.message",
      "n.entity_type",
      "n.entity_id",
      "n.data",

      "u.fcm_tokens"
    )
    .where("jobs.id", jobId)
    .first();
}

// =====================================================
// MARK JOB AS SENT
// =====================================================

async function markJobAsSent(jobId) {
  await knex("notification_push_jobs")
    .where({ id: jobId })
    .update({
      status: "SENT",
      sent_at: knex.fn.now(),
      last_error: null,
      updated_at: knex.fn.now(),
    });
}

// =====================================================
// MARK JOB AS SKIPPED
// =====================================================

async function markJobAsSkipped(jobId, reason) {
  await knex("notification_push_jobs")
    .where({ id: jobId })
    .update({
      status: "SKIPPED",
      last_error: reason,
      updated_at: knex.fn.now(),
    });
}

// =====================================================
// RETRY FAILED JOB
// =====================================================

async function retryOrFailJob(job, error) {
  const attempts = Number(job.attempts);

  const errorMessage = String(
    error?.message || error || "Unknown push delivery error"
  ).slice(0, 4000);

  if (attempts >= MAX_ATTEMPTS) {
    await knex("notification_push_jobs")
      .where({ id: job.id })
      .update({
        status: "FAILED",
        last_error: errorMessage,
        updated_at: knex.fn.now(),
      });

    console.error(
      `Push job ${job.id} permanently failed after ${attempts} attempts:`,
      errorMessage
    );

    return;
  }

  const retryDelay = Math.min(
    BASE_RETRY_DELAY_SECONDS * Math.pow(2, attempts - 1),
    MAX_RETRY_DELAY_SECONDS
  );

  const nextAttemptAt = new Date(
    Date.now() + retryDelay * 1000
  );

  await knex("notification_push_jobs")
    .where({ id: job.id })
    .update({
      status: "PENDING",
      next_attempt_at: nextAttemptAt,
      last_error: errorMessage,
      updated_at: knex.fn.now(),
    });

  console.log(
    `Push job ${job.id} failed. Retry ${attempts}/${MAX_ATTEMPTS} scheduled in ${retryDelay} seconds.`
  );
}

// =====================================================
// PROCESS ONE JOB
// =====================================================

async function processJob(job) {
  try {
    const notification = await getJobDetails(job.id);

    if (!notification) {
      await markJobAsSkipped(
        job.id,
        "Notification or recipient no longer exists."
      );

      return;
    }

    const result = await sendPushNotification(notification);

    if (result.status === "SKIPPED") {
      await markJobAsSkipped(job.id, result.reason);

      console.log(
        `Push job ${job.id} skipped: ${result.reason}`
      );

      return;
    }

    await markJobAsSent(job.id);

    console.log(
      `Push job ${job.id} sent successfully. Devices: ${result.successCount}`
    );
  } catch (error) {
    console.error(
      `Push job ${job.id} delivery error:`,
      error.message
    );

    await retryOrFailJob(job, error);
  }
}

// =====================================================
// PROCESS A BATCH
// =====================================================

async function processBatch() {
  const jobs = await claimPendingJobs();

  if (!jobs.length) {
    return 0;
  }

  console.log(`Processing ${jobs.length} push job(s)...`);

  for (const job of jobs) {
    await processJob(job);
  }

  return jobs.length;
}

// =====================================================
// BACKGROUND WORKER
// =====================================================

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function startNotificationPushWorker() {
  let stopping = false;

  console.log("Notification push worker started.");

  const loopPromise = (async () => {
    while (!stopping) {
      try {
        const processed = await processBatch();

        if (processed === 0 && !stopping) {
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error(
          "Notification worker error:",
          error.message
        );

        if (!stopping) {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    }

    console.log("Notification push worker stopped.");
  })();

  return async function stopNotificationPushWorker() {
    stopping = true;

    await loopPromise;
  };
}

module.exports = {
  startNotificationPushWorker,
};
