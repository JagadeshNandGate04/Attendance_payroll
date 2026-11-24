
const knex = require("../config/database");
const { validateDate } = require("../utils/attendanceUtils");
const { getLocalDateString } = require("../utils/attendanceStatus");

function visibleNotifications(query) {
  const today = getLocalDateString();
  return query.where(function () {
    this.whereNot("type", "ANNOUNCEMENT")
      .orWhereNull("expires_on")
      .orWhere("expires_on", ">=", today);
  });
}

// ==========================================================
// GET NOTIFICATIONS
// ==========================================================

async function getNotifications({
  userId,
  page = 1,
  limit = 20,
  unreadOnly = false
}) {
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(limitNumber) ||
    limitNumber < 1 ||
    limitNumber > 100
  ) {
    const error = new Error("Invalid pagination parameters");
    error.code = "INVALID_PAGINATION";
    throw error;
  }

  const offset = (pageNumber - 1) * limitNumber;

  const query = visibleNotifications(
    knex("notifications").where({ user_id: userId })
  );

  if (
    unreadOnly === true ||
    String(unreadOnly).toLowerCase() === "true"
  ) {
    query.where({ is_read: false });
  }

  const countQuery = query.clone();

  const [notifications, countResult] = await Promise.all([
    query.clone()
      .select(
        "id",
        "user_id",
        "actor_id",
        "type",
        "title",
        "message",
        knex.raw("expires_on::text AS expires_on"),
        "entity_type",
        "entity_id",
        "data",
        "is_read",
        "read_at",
        "created_at"
      )
      .orderByRaw("CASE WHEN is_read = false AND data->>'priority' = 'HIGH' THEN 0 ELSE 1 END")
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limitNumber)
      .offset(offset),

    countQuery.count({ total: "*" }).first()
  ]);

  const total = Number(countResult?.total ?? 0);

  return {
    success: true,
    data: {
      notifications,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        total_pages: Math.ceil(total / limitNumber)
      }
    }
  };
}

// ==========================================================
// GET UNREAD NOTIFICATION COUNT
// ==========================================================

async function getUnreadCount({ userId }) {
  const result = await visibleNotifications(knex("notifications")
    .count({ unread_count: "*" })
    .where({
      user_id: userId,
      is_read: false
    }))
    .first();

  return {
    success: true,
    data: {
      unread_count: Number(result?.unread_count ?? 0)
    }
  };
}

async function getAnnouncements({ userId, limit = 20 }) {
  const announcements = await visibleNotifications(knex("notifications")
    .select(
      "id",
      "title",
      "message",
      knex.raw("expires_on::text AS expires_on"),
      "data",
      "is_read",
      "created_at"
    )
    .where({
      user_id: userId,
      type: "ANNOUNCEMENT"
    }))
    .orderBy("created_at", "desc")
    .limit(limit);

  return announcements;
}

// ==========================================================
// MARK ONE NOTIFICATION AS READ
// ==========================================================

async function markAsRead({
  userId,
  notificationId
}) {
  if (
    !notificationId ||
    !Number.isInteger(Number(notificationId)) ||
    Number(notificationId) <= 0
  ) {
    const error = new Error("Invalid notification ID");
    error.code = "INVALID_NOTIFICATION_ID";
    throw error;
  }

  const id = Number(notificationId);

  const [notification] = await visibleNotifications(knex("notifications")
    .where({
      id,
      user_id: userId
    }))
    .update({
      is_read: true,
      read_at: knex.fn.now()
    })
    .returning([
      "id",
      "type",
      "title",
      "message",
      "is_read",
      "read_at"
    ]);

  if (!notification) {
    const error = new Error("Notification not found");
    error.code = "NOTIFICATION_NOT_FOUND";
    throw error;
  }

  return {
    success: true,
    message: "Notification marked as read",
    data: {
      notification
    }
  };
}

// ==========================================================
// MARK ALL NOTIFICATIONS AS READ
// ==========================================================

async function markAllAsRead({ userId }) {
  const updatedCount = await visibleNotifications(knex("notifications")
    .where({
      user_id: userId,
      is_read: false
    }))
    .update({
      is_read: true,
      read_at: knex.fn.now()
    });

  return {
    success: true,
    message: "All notifications marked as read",
    data: {
      updated_count: Number(updatedCount)
    }
  };
}

// ==========================================================
// CREATE ANNOUNCEMENT FOR ACTIVE EMPLOYEES
// ==========================================================

async function createAnnouncement({
  actorId,
  title,
  message,
  expiresOn
}) {
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 150 ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    const error = new Error(
      "A title of up to 150 characters and a non-empty message are required"
    );
    error.code = "INVALID_ANNOUNCEMENT";
    throw error;
  }

  const announcementTitle = title.trim();
  const announcementMessage = message.trim();
  try {
    validateDate(expiresOn);
  } catch (error) {
    const invalidDate = new Error("expires_on must be a valid date in YYYY-MM-DD format");
    invalidDate.code = "INVALID_ANNOUNCEMENT";
    throw invalidDate;
  }
  if (expiresOn < getLocalDateString()) {
    const error = new Error("expires_on cannot be in the past");
    error.code = "INVALID_ANNOUNCEMENT";
    throw error;
  }

  const recipientCount = await knex.transaction(async (trx) => {
    const employees = await trx("users")
      .select("id")
      .whereRaw("UPPER(role) = ?", ["EMPLOYEE"])
      .whereRaw("UPPER(status) = ?", ["ACTIVE"]);

    const notifications = employees.map((employee) => ({
      user_id: employee.id,
      actor_id: actorId,
      type: "ANNOUNCEMENT",
      title: announcementTitle,
      message: announcementMessage,
      entity_type: "announcement",
      expires_on: expiresOn,
      data: { expires_on: expiresOn }
    }));

    const batchSize = 500;

    for (let index = 0; index < notifications.length; index += batchSize) {
      await trx("notifications").insert(
        notifications.slice(index, index + batchSize)
      );
    }

    return notifications.length;
  });

  return {
    success: true,
    message: "Announcement sent to active employees",
    data: {
      recipient_count: recipientCount,
      expires_on: expiresOn
    }
  };
}

module.exports = {
  getNotifications,
  getUnreadCount,
  getAnnouncements,
  markAsRead,
  markAllAsRead,
  createAnnouncement
};
