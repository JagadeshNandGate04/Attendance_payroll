const express = require('express');

const router = express.Router();

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

  const adminController = require('../controllers/adminController')

router.get('/dashboard', adminAuthorize(),adminController.getAdminDashboard)

router.get(
  "/requests/inbox",
  adminAuthorize(),
  adminController.getAdminRequestsInbox
);

router.post(
  "/employees",
  adminAuthorize(),
  adminController.createEmployee
);

router.patch(
  "/employees/:id",
  adminAuthorize(),
  adminController.updateEmployee
);


router.post(
  "/employees/:id/salary",
  adminAuthorize(),
  adminController.addEmployeeSalary
);

router.post(
  "/employees/:id/leave-adjust",
  adminAuthorize(),
  adminController.adjustEmployeeLeave
);

router.get(
  "/employees/:id/salary",
  adminAuthorize(),
  adminController.getEmployeeCurrentSalary
);

router.patch(
  "/employees/:id/salary",
  adminAuthorize(),
  adminController.editEmployeeSalary
);

router.get(
  "/employees/:id/salary/history",
  adminAuthorize(),
  adminController.getEmployeeSalaryHistory
);

  module.exports = router;