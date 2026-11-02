const express = require('express');
const router = express.Router();
const {
  userAuthorize
} = require('../middleware/auth');

const leaveController = require('../controllers/leaveController');

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;



router.get(
  '/me/balance',
  userAuthorize(),
  leaveController.getMyLeaveBalance
);

router.post(
  '/me/apply',
  userAuthorize(),
  leaveController.applyMyLeave
);


router.post(
  '/me/:id/cancel',
  userAuthorize(),
  leaveController.cancelMyLeave
);

router.get(
  '/admin/requests',
  adminAuthorize(),
  leaveController.getAdminLeaveRequests
);

router.post('/admin/:id/decide', adminAuthorize(), leaveController.decideAdminLeave);

module.exports = router;
