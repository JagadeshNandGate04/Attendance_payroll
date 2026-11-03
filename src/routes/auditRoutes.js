const express = require('express');

const router = express.Router();

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

const auditLogController = require('../controllers/auditLogController')


router.get(
  "/admin/audit-logs",
  adminAuthorize(),
  auditLogController.getAuditLogs
);

router.get(
  "/admin/audit-logs/:id",
  adminAuthorize(),
  auditLogController.getAuditLogById
);

  module.exports = router;