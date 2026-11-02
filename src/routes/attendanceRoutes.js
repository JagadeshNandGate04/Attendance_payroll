const express = require('express');

const router = express.Router();

const {
  userAuthorize
} = require('../middleware/auth');

const attendanceController =
  require('../controllers/attendanceController');

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

router.get(
  '/me',
  userAuthorize(),
  attendanceController.getMyAttendance
);

router.get(
  '/me/day',
  userAuthorize(),
  attendanceController.getMyAttendanceDay
);

router.get(
  '/admin/daily',
  adminAuthorize(),
  attendanceController.getAdminDailyAttendance
);

router.get(
  '/admin/monthly',
  adminAuthorize(),
  attendanceController.getAdminMonthlyAttendance
);

router.post(
  '/admin/correction',
  adminAuthorize(),
  attendanceController.addAttendanceCorrection
);

router.post(
  '/admin/correction/:id/void',
  adminAuthorize(),
  attendanceController.voidAttendanceCorrection
);


module.exports = router;