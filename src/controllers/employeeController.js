const employeeService = require("../services/employeeService");

async function createEmployee(req, res) {
  try {
    const { name, email, phone, password, date_of_joining, designation } =
      req.body;

    const errors = {};

    const nameRegex = /^[A-Za-z ]+$/;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const phoneRegex = /^[0-9]{10}$/;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    const designationRegex = /^[A-Za-z ]+$/;

    if (!name || String(name).trim() === "") {
      errors.name = "Name is required";
    } else if (!nameRegex.test(String(name).trim())) {
      errors.name = "Name can contain only letters and spaces";
    }

    if (!email || String(email).trim() === "") {
      errors.email = "Email is required";
    } else if (!emailRegex.test(String(email).trim())) {
      errors.email = "Enter a valid email address";
    }

    if (!phone || String(phone).trim() === "") {
      errors.phone = "Phone is required";
    } else if (!phoneRegex.test(String(phone).trim())) {
      errors.phone = "Phone number must contain exactly 10 digits";
    }

    if (!password || String(password).trim() === "") {
      errors.password = "Password is required";
    } else if (!passwordRegex.test(password)) {
      errors.password =
        "Password must contain at least 8 characters, one uppercase letter, one lowercase letter and one number";
    }

    if (!date_of_joining || String(date_of_joining).trim() === "") {
      errors.date_of_joining = "Date of joining is required";
    } else {
      const value = String(date_of_joining).trim();

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (!dateRegex.test(value)) {
        errors.date_of_joining = "Date must be in YYYY-MM-DD format";
      } else {
        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
          errors.date_of_joining = "Invalid date";
        }
      }
    }

    if (!designation || String(designation).trim() === "") {
      errors.designation = "Designation is required";
    } else if (!designationRegex.test(String(designation).trim())) {
      errors.designation = "Designation can contain only letters and spaces";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    const result = await employeeService.createEmployee({
      name: String(name).trim(),

      email: String(email).trim().toLowerCase(),

      phone: String(phone).trim(),

      password,

      date_of_joining: String(date_of_joining).trim(),

      designation: String(designation).trim(),
    });

    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error("Create employee controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create employee",
    });
  }
}

async function getAllEmployees(req, res, next) {
  try {
    const employees = await employeeService.getAllEmployees();

    res.status(200).json({
      success: true,
      message: "Employees fetched successfully.",
      data: employees,
    });
  } catch (error) {
    next(error);
  }
}

// FETCH EMPLOYEE BY ID

async function getEmployeeById(req, res) {
  try {
    const { id } = req.params;

    // Basic id validation before hitting the DB
    if (!id || !/^\d+$/.test(String(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee id",
      });
    }

    const result = await employeeService.getEmployeeById(id);

    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error("Get employee controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee",
    });
  }
}

module.exports = {
  createEmployee,
  getAllEmployees,
  getEmployeeById
};
