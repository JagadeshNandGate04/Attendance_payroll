const express = require('express');
const router = express.Router();

const {
  userAuthorize
} = require('../middleware/auth');

const permissionController = require('../controllers/permissionController');

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

  router.get('/me/balance', userAuthorize(), permissionController.getMyPermissionBalance);
  router.post('/me/apply', userAuthorize(), permissionController.applyMyPermission);
  router.post('/me/:id/cancel', userAuthorize(), permissionController.cancelMyPermission);
  router.get(
  "/me/permission/requests",
  userAuthorize(),
  permissionController.getMyPermissionRequests
);
  router.post('/admin/:id/decide', adminAuthorize(), permissionController.decideAdminPermission);
  router.get(
  "/admin/permissions",
  adminAuthorize(),
  permissionController.getAdminPermissionRequests
);

module.exports = router;
