const express = require('express');

const router = express.Router();

const {
  createEmployee,
  getAllEmployees,
  getEmployeeById
} = require('../controllers/employeeController');

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

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