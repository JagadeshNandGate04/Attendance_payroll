
const knex = require("../config/database");

const { getFirebaseAdmin } = require("../../config/firebase");

const { getMessaging } = require("firebase-admin/messaging");

const MAX_FCM_TOKENS_PER_REQUEST = 500;

// =====================================================
// TOKEN HELPERS
// =====================================================

function parseTokens(value) {
  let tokens = value;

  if (typeof tokens === "string") {
    try {
      tokens = JSON.parse(tokens);
    } catch (error) {
      tokens = [];
    }
  }

  if (!Array.isArray(tokens)) {
    return [];
  }

  return [
    ...new Set(
      tokens.filter(
        (token) =>
          typeof token === "string" &&
          token.trim().length > 0
      )
    ),
  ];
}

// =====================================================
// FIREBASE DATA HELPER
// FCM data values must be strings.
// =====================================================

function stringifyData(data = {}) {
  const result = {};

  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) {
      continue;
    }

    result[key] =
      typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  }

  return result;
}

// =====================================================
// REMOVE INVALID TOKENS
// =====================================================

async function removeInvalidTokens(userId, invalidTokens) {
  if (!invalidTokens.length) {
    return;
  }

  await knex.transaction(async (trx) => {
    const user = await trx("users")
      .select("id", "fcm_tokens")
      .where({ id: userId })
      .forUpdate()
      .first();

    if (!user) {
      return;
    }

    const invalidSet = new Set(invalidTokens);

    const currentTokens = parseTokens(user.fcm_tokens);

    const updatedTokens = currentTokens.filter(
      (token) => !invalidSet.has(token)
    );

    await trx("users")
      .where({ id: userId })
      .update({
        fcm_tokens: JSON.stringify(updatedTokens),
        updated_at: trx.fn.now(),
      });
  });

  console.log(
    `Removed ${invalidTokens.length} invalid FCM token(s) for user ${userId}`
  );
}

// =====================================================
// CHECK INVALID TOKEN ERROR
// =====================================================

function isInvalidTokenError(error) {
  const invalidCodes = [
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ];

  return invalidCodes.includes(error?.code);
}

// =====================================================
// SEND PUSH NOTIFICATION
// =====================================================

async function sendPushNotification(notification) {
  const {
    user_id,
    notification_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    data,
    fcm_tokens,
  } = notification;

  const tokens = parseTokens(fcm_tokens);

  // No registered devices
  if (!tokens.length) {
    return {
      status: "SKIPPED",
      reason: "No registered FCM tokens found.",
    };
  }

  // Initialize Firebase lazily
  const firebaseApp = getFirebaseAdmin();

  const messaging = getMessaging(firebaseApp);

  const notificationData = stringifyData(data);

  const fcmData = {
    ...notificationData,
    notificationId: String(notification_id),
    type: String(type),
    entityType: entity_type
      ? String(entity_type)
      : "",
    entityId: entity_id
      ? String(entity_id)
      : "",
  };

  const invalidTokens = [];

  let successCount = 0;

  const errors = [];

  // Firebase allows at most 500 tokens per multicast request
  for (
    let index = 0;
    index < tokens.length;
    index += MAX_FCM_TOKENS_PER_REQUEST
  ) {
    const tokenBatch = tokens.slice(
      index,
      index + MAX_FCM_TOKENS_PER_REQUEST
    );

    const response = await messaging.sendEachForMulticast({
      tokens: tokenBatch,

      notification: {
        title,
        body: message,
      },

      data: fcmData,

      android: {
        priority: "high",
      },

      apns: {
        headers: {
          "apns-priority": "10",
        },
      },

      webpush: {
        headers: {
          Urgency: "high",
        },
        notification: {
          title,
          body: message,
        },
      },
    });

    successCount += response.successCount;

    response.responses.forEach((item, tokenIndex) => {
      if (item.success) {
        return;
      }

      const error = item.error;

      if (isInvalidTokenError(error)) {
        invalidTokens.push(tokenBatch[tokenIndex]);
      } else {
        errors.push(
          `${error?.code || "UNKNOWN"}: ${
            error?.message || "FCM delivery failed"
          }`
        );
      }
    });
  }

  // Remove expired or invalid device tokens
  await removeInvalidTokens(user_id, invalidTokens);

  // Retry if any non-invalid-token failures occurred
  if (errors.length > 0) {
    throw new Error(
      `FCM delivery failed: ${errors.join("; ").slice(0, 3000)}`
    );
  }

  // All registered tokens were invalid
  if (successCount === 0) {
    return {
      status: "SKIPPED",
      reason: "All registered FCM tokens were invalid.",
    };
  }

  return {
    status: "SENT",
    successCount,
    invalidTokenCount: invalidTokens.length,
  };
}

module.exports = {
  sendPushNotification,
  removeInvalidTokens,
};
