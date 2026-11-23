const express = require('express');

const router = express.Router();

const {
  getMyDashboard,
  getMyCalendar,
  createEmployee,
  getAllEmployees,
  getEmployeeById
} = require('../controllers/employeeController');

const { userAuthorize } = require('../middleware/auth');
const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

router.get('/me/dashboard', userAuthorize(), getMyDashboard);
router.get('/me/calendar', userAuthorize(), getMyCalendar);

router.post(
  '/create-employees',
  adminAuthorize(),
  createEmployee
);

router.get('/all-employees', adminAuthorize(), getAllEmployees);

router.get(
  '/employees/:id',
  adminAuthorize(),
  getEmployeeById
);


module.exports = router;