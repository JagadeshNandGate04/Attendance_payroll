const express = require("express");
const router = express.Router();

const { userAuthorize } = require("../middleware/auth");
const { adminAuthorize } = require("../middleware/admin");

const authController = require("../controllers/authController");

// ==========================================
// PUBLIC ROUTES
// ==========================================

router.post("/login", authController.login);

router.post("/refresh", authController.refreshToken);

router.post("/forgot-password", authController.forgotPassword);

router.post("/verify-reset-otp", authController.verifyResetOtp);

router.post("/reset-password", authController.resetPassword);


// ==========================================
// EMPLOYEE ROUTES
// ==========================================

router.post(
  "/changepassword",
  userAuthorize(),
  authController.changePassword
);

router.post(
  "/fcm-token",
  userAuthorize(),
  authController.saveFcmToken
);

router.delete(
  "/fcm-token",
  userAuthorize(),
  authController.removeFcmToken
);

router.post(
  "/logout",
  userAuthorize(),
  authController.logout
);


// ==========================================
// ADMIN ROUTES
// ==========================================

router.post(
  "/admin/changepassword",
  adminAuthorize(),
  authController.adminChangePassword
);

router.post(
  "/admin/fcm-token",
  adminAuthorize(),
  authController.saveFcmToken
);

router.delete(
  "/admin/fcm-token",
  adminAuthorize(),
  authController.removeFcmToken
);

router.post(
  "/admin/logout",
  adminAuthorize(),
  authController.logout
);

module.exports = router;