const leaveService = require('../services/LeaveService');

// EMPLOYEE LEAVE BALANCE
async function getMyLeaveBalance(req, res) {
  try {
    const userId = req.user.id;

    const result = await leaveService.getMyLeaveBalance({
      userId
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Get leave balance error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching leave balance'
    });
  }
}

// LEAVE APPLY FOR EMPLOYEE
// async function applyMyLeave(req, res) {
//   try {
//     const userId = req.user.id;

//     const { from_date, to_date, reason } = req.body;

//     const result = await leaveService.applyMyLeave({
//       userId,
//       fromDate: from_date,
//       toDate: to_date,
//       reason
//     });

//     return res.status(201).json(result);
//   } catch (error) {
//     console.error('Apply leave error:', error);

//     if (
//       error.code === 'INVALID_DATE_RANGE' ||
//       error.code === 'INVALID_REASON' ||
//       error.code === 'NO_LEAVE_DAYS'
//     ) {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message
//       });
//     }

//     if (error.code === 'INSUFFICIENT_BALANCE') {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message,
//         data: {
//           available_balance: error.availableBalance,
//           requested_days: error.requestedDays
//         }
//       });
//     }

//     // NEW: MONTHLY LEAVE LIMIT
//     if (error.code === 'MONTHLY_LEAVE_LIMIT_EXCEEDED') {
//       return res.status(400).json({
//         success: false,
//         error: error.code,
//         message: error.message,
//         data: {
//           monthly_usage: error.monthlyUsage
//         }
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: 'Internal server error while applying leave'
//     });
//   }
// }

async function applyMyLeave(req, res) {
  try {
    const userId = req.user.id;

    const {
      from_date,
      to_date,
      reason
    } = req.body;

    const result = await leaveService.applyMyLeave({
      userId,
      fromDate: from_date,
      toDate: to_date,
      reason
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error("Apply leave error:", error);

    if (
      error.code === "INVALID_DATE_RANGE" ||
      error.code === "INVALID_REASON" ||
      error.code === "NO_LEAVE_DAYS"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          available_balance: error.availableBalance,
          requested_days: error.requestedDays
        }
      });
    }

    if (error.code === "MONTHLY_LEAVE_LIMIT_EXCEEDED") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          monthly_usage: error.monthlyUsage
        }
      });
    }

    if (error.code === "LEAVE_DATE_CONFLICT") {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          conflicting_request: error.conflictingRequest
        }
      });
    }

    if (error.code === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while applying leave"
    });
  }
}


// CANCEL LEAVE REQUEST
async function cancelMyLeave(req, res) {
  try {
    const userId = req.user.id;
    const leaveRequestId = req.params.id;

    const result = await leaveService.cancelMyLeave({
      userId,
      leaveRequestId
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Cancel leave error:', error);

    if (error.code === 'LEAVE_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === 'LEAVE_NOT_CANCELLABLE') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          status: error.status
        }
      });
    }

    if (error.code === 'INVALID_LEAVE_ID') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while cancelling leave'
    });
  }
}

// GET EMPLOYEE'S OWN LEAVE REQUESTS
async function getMyLeaveRequests(req, res) {
  try {
    const userId = req.user.id;
    const role = String(req.user.role || "").toUpperCase();

    // Only employees can access this endpoint.
    if (role !== "EMPLOYEE") {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Only employees can access their own leave requests"
      });
    }

    const { month, year } = req.query;

    const result = await leaveService.getMyLeaveRequests({
      userId,
      month,
      year
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get my leave requests error:", error);

    if (
      error.code === "INVALID_MONTH" ||
      error.code === "INVALID_YEAR"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching leave requests"
    });
  }
}

// GET LEAVE REQUESTS BY ADMIN
async function getAdminLeaveRequests(req, res) {
  try {
    const { status, month, year } = req.query;

    const result = await leaveService.getAdminLeaveRequests({
      status,
      month,
      year
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Get admin leave requests error:', error);

    if (
      error.code === 'INVALID_STATUS' ||
      error.code === 'INVALID_MONTH' ||
      error.code === 'INVALID_YEAR'
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching leave requests'
    });
  }
}

// ADMIN LEAVE APPROVAL / REJECTION
async function decideAdminLeave(req, res) {
  try {
    const adminId = req.user.id;
    const leaveRequestId = req.params.id;

    const { action, note } = req.body;

    const result = await leaveService.decideAdminLeave({
      adminId,
      leaveRequestId,
      action,
      note
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Admin decide leave error:', error);

    if (
      error.code === 'INVALID_LEAVE_ID' ||
      error.code === 'INVALID_ACTION' ||
      error.code === 'INVALID_NOTE'
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === 'LEAVE_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message
      });
    }

    if (error.code === 'LEAVE_NOT_DECIDABLE') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          status: error.status
        }
      });
    }

    if (error.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          available_balance: error.availableBalance,
          requested_days: error.requestedDays
        }
      });
    }

    // NEW: MONTHLY LEAVE LIMIT
    if (error.code === 'MONTHLY_LEAVE_LIMIT_EXCEEDED') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          monthly_usage: error.monthlyUsage
        }
      });
    }

    if (error.code === 'MONTH_LOCKED') {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          locked_date: error.lockedDate
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while deciding leave request'
    });
  }
}

module.exports = {
  getMyLeaveBalance,
  applyMyLeave,
  cancelMyLeave,
  getMyLeaveRequests,
  getAdminLeaveRequests,
  decideAdminLeave
};