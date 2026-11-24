const express = require("express");
const router = express.Router();

const { userAuthorize } =
  require("../middleware/auth");

const { adminAuthorize } =
  require("../middleware/admin");

const notificationController =
  require("../controllers/notificationController");

// EMPLOYEE NOTIFICATIONS

router.get(
  "/me/birthdays",
  userAuthorize(),
  notificationController.getBirthdays
);

router.get(
  "/me/get-notifications",
  userAuthorize(),
  notificationController.getNotifications
);

router.get(
  "/me/unread-count",
  userAuthorize(),
  notificationController.getUnreadCount
);

router.patch(
  "/me/read-all",
  userAuthorize(),
  notificationController.markAllAsRead
);

router.patch(
  "/me/:id/read",
  userAuthorize(),
  notificationController.markAsRead
);

// ADMIN NOTIFICATIONS

router.get(
  "/admin/birthdays",
  adminAuthorize(),
  notificationController.getBirthdays
);

router.get(
  "/admin/get-notifications",
  adminAuthorize(),
  notificationController.getNotifications
);

router.get(
  "/admin/unread-count",
  adminAuthorize(),
  notificationController.getUnreadCount
);

router.patch(
  "/admin/mark-all-as-read",
  adminAuthorize(),
  notificationController.markAllAsRead
);

router.patch(
  "/admin/:id/read",
  adminAuthorize(),
  notificationController.markAsRead
);

router.post(
  "/admin/announcements",
  adminAuthorize(),
  notificationController.createAnnouncement
);

module.exports = router;