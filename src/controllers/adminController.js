const adminService = require('../services/adminService')

// // ADMIN DASHBOARD

// async function getAdminDashboard(req, res) {
//   try {
//     const result = await adminService.getAdminDashboard();

//     return res.status(200).json(result);
//   } catch (error) {
//     console.error('Get admin dashboard error:', error);

//     return res.status(500).json({
//       success: false,
//       message: 'Internal server error while fetching admin dashboard'
//     });
//   }
// }


// ADMIN DASHBOARD

async function getAdminDashboard(req, res) {
  try {
    const period = String(req.query.period || "week").toLowerCase();

    if (!["day", "week", "month"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Use day, week, or month.",
      });
    }

    const result = await adminService.getAdminDashboard({ period });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching admin dashboard",
    });
  }
}


// GET ADMIN REQUESTS INBOX

async function getAdminRequestsInbox(req, res) {
  try {
    const result =
      await adminService.getAdminRequestsInbox();

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Get admin requests inbox error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error while fetching requests inbox"
    });
  }
}


// CREATE EMPLOYEE

// async function createEmployee(req, res) {
//   try {
//     const {
//       emp_code,
//       name,
//       email,
//       phone,
//       designation,
//       date_of_joining,
//       basic,
//       hra,
//       special_allowance
//     } = req.body;

//     const adminId = req.user.id;

//     const result = await adminService.createEmployee({
//       adminId,
//       emp_code,
//       name,
//       email,
//       phone,
//       designation,
//       date_of_joining,
//       basic,
//       hra,
//       special_allowance
//     });

//     return res.status(201).json(result);

//   } catch (error) {

//     console.error(
//       "Create employee error:",
//       error
//     );

//     if (error.code === "REQUIRED_FIELDS") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     if (error.code === "INVALID_EMAIL") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     if (error.code === "INVALID_DATE") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     if (error.code === "INVALID_SALARY") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     if (error.code === "DUPLICATE_EMP_CODE") {
//       return res.status(409).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     if (error.code === "DUPLICATE_EMAIL") {
//       return res.status(409).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message:
//         "Internal server error while creating employee"
//     });
//   }
// }


// CREATE EMPLOYEE

async function createEmployee(req, res) {
  try {
    const {
      emp_code,
      name,
      email,
      phone,
      designation,
      date_of_joining,
      basic,
      hra,
      da,
      special_allowance,
    } = req.body;

    const adminId = req.user.id;

    const result = await adminService.createEmployee({
      adminId,
      emp_code,
      name,
      email,
      phone,
      designation,
      date_of_joining,
      basic,
      hra,
      da,
      special_allowance,
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error("Create employee error:", error);

    // VALIDATION ERRORS

    const badRequestErrors = [
      "REQUIRED_FIELDS",
      "INVALID_EMAIL",
      "INVALID_DATE",
      "INVALID_SALARY",
    ];

    if (badRequestErrors.includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // DUPLICATE ERRORS

    const conflictErrors = [
      "DUPLICATE_EMP_CODE",
      "DUPLICATE_EMAIL",
    ];

    if (conflictErrors.includes(error.code)) {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INTERNAL SERVER ERROR

    return res.status(500).json({
      success: false,
      message: "Internal server error while creating employee",
    });
  }
}


// UPDATE EMPLOYEE

async function updateEmployee(req, res) {
  try {
    const { id } = req.params;

    const {
      emp_code,
      name,
      email,
      phone,
      designation,
      date_of_joining,
      status,
      basic,
      hra,
      special_allowance
    } = req.body;

    const adminId = req.user.id;

    const result = await adminService.updateEmployee({
      adminId,
      userId: id,
      emp_code,
      name,
      email,
      phone,
      designation,
      date_of_joining,
      status,
      basic,
      hra,
      special_allowance
    });

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Update employee error:",
      error
    );

    if (error.code === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "INVALID_STATUS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "INVALID_EMAIL") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "INVALID_DATE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "INVALID_SALARY") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "DUPLICATE_EMP_CODE") {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "DUPLICATE_EMAIL") {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Internal server error while updating employee"
    });
  }
}

// ADD EMPLOYEE SALARY STRUCTURE

// async function addEmployeeSalary(req, res) {
//   try {

//     const { id } = req.params;

//     const {
//       basic,
//       hra,
//       special_allowance,
//       effective_from
//     } = req.body;

//     const adminId = req.user.id;

//     const result =
//       await adminService.addEmployeeSalary({
//         adminId,
//         userId: id,
//         basic,
//         hra,
//         special_allowance,
//         effective_from
//       });

//     return res
//       .status(201)
//       .json(result);

//   } catch (error) {

//     console.error(
//       "Add employee salary error:",
//       error
//     );

//     // INVALID ID

//     if (error.code === "INVALID_ID") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }


//     // EMPLOYEE NOT FOUND

//     if (error.code === "EMPLOYEE_NOT_FOUND") {
//       return res.status(404).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }


//     // REQUIRED FIELDS

//     if (error.code === "REQUIRED_FIELDS") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }


//     // INVALID SALARY

//     if (error.code === "INVALID_SALARY") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }


//     // INVALID DATE

//     if (error.code === "INVALID_DATE") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }


//     // INVALID EFFECTIVE DATE

//     if (error.code === "INVALID_EFFECTIVE_DATE") {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }


//     return res.status(500).json({
//       success: false,
//       message:
//         "Internal server error while adding employee salary"
//     });
//   }
// }

// ADD EMPLOYEE SALARY STRUCTURE

async function addEmployeeSalary(req, res) {
  try {
    const { id } = req.params;

    const {
      basic,
      hra,
      da,
      special_allowance,
      effective_from,
    } = req.body;

    const adminId = req.user.id;

    const result = await adminService.addEmployeeSalary({
      adminId,
      userId: id,
      basic,
      hra,
      da,
      special_allowance,
      effective_from,
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error("Add employee salary error:", error);

    // INVALID ID
    if (error.code === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // EMPLOYEE NOT FOUND
    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // REQUIRED FIELDS
    if (error.code === "REQUIRED_FIELDS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID SALARY
    if (error.code === "INVALID_SALARY") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID DATE
    if (error.code === "INVALID_DATE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID EFFECTIVE DATE
    if (error.code === "INVALID_EFFECTIVE_DATE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while adding employee salary",
    });
  }
}

// ADJUST EMPLOYEE LEAVE BALANCE

async function adjustEmployeeLeave(req, res) {
  try {

    const { id } = req.params;

    const {
      delta,
      note
    } = req.body;

    const adminId = req.user.id;

    const result =
      await adminService.adjustEmployeeLeave({
        adminId,
        userId: id,
        delta,
        note
      });

    return res
      .status(201)
      .json(result);

  } catch (error) {

    console.error(
      "Adjust employee leave error:",
      error
    );


    // INVALID ID

    if (error.code === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }


    // EMPLOYEE NOT FOUND

    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }


    // INVALID DELTA

    if (error.code === "INVALID_DELTA") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }


    // REQUIRED NOTE

    if (error.code === "INVALID_NOTE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }


    return res.status(500).json({
      success: false,
      message:
        "Internal server error while adjusting employee leave"
    });
  }
}


// GET EMPLOYEE CURRENT SALARY STRUCTURE

async function getEmployeeCurrentSalary(req, res) {
  try {
    const { id } = req.params;

    const result = await adminService.getEmployeeCurrentSalary({
      userId: id,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get employee current salary error:", error);

    // INVALID EMPLOYEE ID
    if (error.code === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // EMPLOYEE NOT FOUND
    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // CURRENT SALARY NOT FOUND
    if (error.code === "SALARY_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching employee salary",
    });
  }
}

// EDIT EMPLOYEE SALARY STRUCTURE

async function editEmployeeSalary(req, res) {
  try {
    const { id } = req.params;

    const {
      basic,
      hra,
      da,
      special_allowance,
      effective_from,
    } = req.body;

    const adminId = req.user.id;

    const result = await adminService.editEmployeeSalary({
      adminId,
      userId: id,
      basic,
      hra,
      da,
      special_allowance,
      effective_from,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Edit employee salary error:", error);

    // INVALID EMPLOYEE ID
    if (error.code === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // EMPLOYEE NOT FOUND
    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // CURRENT SALARY NOT FOUND
    if (error.code === "SALARY_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // REQUIRED FIELDS
    if (error.code === "REQUIRED_FIELDS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID SALARY
    if (error.code === "INVALID_SALARY") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID DATE
    if (error.code === "INVALID_DATE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID EFFECTIVE DATE
    if (error.code === "INVALID_EFFECTIVE_DATE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while editing employee salary",
    });
  }
}

// GET EMPLOYEE SALARY HISTORY

async function getEmployeeSalaryHistory(req, res) {
  try {
    const { id } = req.params;

    const result = await adminService.getEmployeeSalaryHistory({
      userId: id,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get employee salary history error:", error);

    // INVALID EMPLOYEE ID
    if (error.code === "INVALID_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // EMPLOYEE NOT FOUND
    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // SALARY HISTORY NOT FOUND
    if (error.code === "SALARY_HISTORY_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching employee salary history",
    });
  }
}

module.exports = {
getAdminDashboard,
getAdminRequestsInbox,
createEmployee,
updateEmployee,
addEmployeeSalary,
adjustEmployeeLeave,
getEmployeeCurrentSalary,
editEmployeeSalary,
getEmployeeSalaryHistory
};