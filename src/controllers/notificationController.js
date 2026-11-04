
const notificationService = require("../services/NotificationService");

// GET NOTIFICATIONS
async function getNotifications(req, res) {
  try {
    const result = await notificationService.getNotifications({
      userId: req.user.id,
      page: req.query.page || 1,
      limit: req.query.limit || 20,
      unreadOnly: req.query.unread_only
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get notifications error:", error);

    if (error.code === "INVALID_PAGINATION") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching notifications"
    });
  }
}

// GET UNREAD COUNT
async function getUnreadCount(req, res) {
  try {
    const result = await notificationService.getUnreadCount({
      userId: req.user.id
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get unread count error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching unread count"
    });
  }
}

// MARK ONE AS READ
async function markAsRead(req, res) {
  try {
    const result = await notificationService.markAsRead({
      userId: req.user.id,
      notificationId: req.params.id
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Mark notification as read error:", error);

    if (error.code === "INVALID_NOTIFICATION_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "NOTIFICATION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while updating notification"
    });
  }
}

// MARK ALL AS READ
async function markAllAsRead(req, res) {
  try {
    const result = await notificationService.markAllAsRead({
      userId: req.user.id
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Mark all notifications as read error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while updating notifications"
    });
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
