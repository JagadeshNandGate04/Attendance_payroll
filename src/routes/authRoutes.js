const express = require('express');
const router = express.Router();
const {
  userAuthorize
} = require('../middleware/auth');

const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/changepassword', userAuthorize(), authController.changePassword);
router.post('/fcm-token', userAuthorize(), authController.saveFcmToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-otp', authController.verifyResetOtp);
router.post('/reset-password', authController.resetPassword);

module.exports = router;