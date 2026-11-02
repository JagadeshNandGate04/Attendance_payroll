const express =
  require('express');

const router =
  express.Router();

const payrollController = require("../controllers/payrollController")

const {
  userAuthorize
} = require('../middleware/auth');


const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

  router.post('/runs', adminAuthorize(), payrollController.createPayrollRun)
 router.get(
  "/status/runs",
  adminAuthorize(),
  payrollController.getPayrollRuns
);

router.get(
  "/runs/:id",
  adminAuthorize(),
  payrollController.getPayrollRunById
);

router.patch(
    "/items/:id",
    adminAuthorize(),
    payrollController.updatePayrollItem
);

router.post(
    "/runs/:id/recompute",
    adminAuthorize(),
    payrollController.recomputePayrollRun
);

router.post(
  "/runs/:id/finalize",
  adminAuthorize(),
  payrollController.finalizePayrollRun
);

router.get(
  "/runs/:id/export",
  adminAuthorize(),
  payrollController.exportPayrollRun
);

router.get(
  "/payslips/me",
  userAuthorize(),
  payrollController.getMyPayslips
);
router.get(
  "/payslips/me/:id/download",
  userAuthorize(),
  payrollController.downloadMyPayslip
);



module.exports = router;
