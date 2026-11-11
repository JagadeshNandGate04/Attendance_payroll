
const permissionService = require("../services/PermissionService");

// ==========================================================
// GET MY PERMISSION BALANCE
// ==========================================================

async function getMyPermissionBalance(req, res) {
  try {
    const userId = req.user.id;

    const { month, year } = req.query;

    const result = await permissionService.getMyPermissionBalance({
      userId,
      month,
      year,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get permission balance error:", error);

    if (
      error.code === "INVALID_MONTH" ||
      error.code === "INVALID_YEAR"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching permission balance",
    });
  }
}

// ==========================================================
// APPLY PERMISSION
// ==========================================================

async function applyMyPermission(req, res) {
  try {
    const userId = req.user.id;

    const {
      perm_date,
      start_time,
      minutes,
      reason,
    } = req.body;

    const result = await permissionService.applyMyPermission({
      userId,
      permDate: perm_date,
      startTime: start_time,
      minutes,
      reason,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("Apply permission error:", error);

    if (
      error.code === "INVALID_DATE" ||
      error.code === "INVALID_TIME" ||
      error.code === "INVALID_MINUTES" ||
      error.code === "INVALID_REASON" ||
      error.code === "PERMISSION_LIMIT_EXCEEDED"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,

        ...(error.availableMinutes !== undefined && {
          data: {
            available_minutes: error.availableMinutes,
            requested_minutes: error.requestedMinutes,
          },
        }),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while applying permission",
    });
  }
}

// ==========================================================
// CANCEL PERMISSION
// ==========================================================

async function cancelMyPermission(req, res) {
  try {
    const userId = req.user.id;

    const permissionRequestId = req.params.id;

    const result = await permissionService.cancelMyPermission({
      userId,
      permissionRequestId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Cancel permission error:", error);

    if (
      error.code === "INVALID_PERMISSION_ID" ||
      error.code === "PERMISSION_NOT_FOUND" ||
      error.code === "PERMISSION_NOT_CANCELLABLE"
    ) {
      return res
        .status(error.code === "PERMISSION_NOT_FOUND" ? 404 : 400)
        .json({
          success: false,
          error: error.code,
          message: error.message,

          ...(error.status && {
            data: {
              status: error.status,
            },
          }),
        });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while cancelling permission",
    });
  }
}


// ==========================================================
// GET MY PERMISSION REQUESTS
// ==========================================================

async function getMyPermissionRequests(req, res) {
  try {
    const userId = req.user.id;
    const role = String(req.user.role || "").toUpperCase();

    // Only employees can access this endpoint.
    if (role !== "EMPLOYEE") {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Only employees can access their own permission requests"
      });
    }

    const { month, year } = req.query;

    const result = await permissionService.getMyPermissionRequests({
      userId,
      month,
      year
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get my permission requests error:", error);

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
      message: "Internal server error while fetching permission requests"
    });
  }
}

// ==========================================================
// ADMIN DECIDE PERMISSION
// ==========================================================

async function decideAdminPermission(req, res) {
  try {
    const adminId = req.user.id;

    const permissionRequestId = req.params.id;

    const { action, note } = req.body;

    const result = await permissionService.decideAdminPermission({
      adminId,
      permissionRequestId,
      action,
      note,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Admin decide permission error:", error);

    if (
      error.code === "INVALID_PERMISSION_ID" ||
      error.code === "INVALID_ACTION" ||
      error.code === "INVALID_NOTE" ||
      error.code === "PERMISSION_NOT_FOUND"
    ) {
      return res
        .status(error.code === "PERMISSION_NOT_FOUND" ? 404 : 400)
        .json({
          success: false,
          error: error.code,
          message: error.message,
        });
    }

    if (error.code === "PERMISSION_NOT_DECIDABLE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          status: error.status,
        },
      });
    }

    if (error.code === "MONTH_LOCKED") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          locked_date: error.lockedDate,
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while deciding permission",
    });
  }
}

// ==========================================================
// GET ADMIN PERMISSION REQUESTS
// ==========================================================

async function getAdminPermissionRequests(req, res) {
  try {
    const {
      status,
      month,
      year,
    } = req.query;

    const result =
      await permissionService.getAdminPermissionRequests({
        status,
        month,
        year,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      "Get admin permission requests error:",
      error
    );

    if (
      error.code === "INVALID_STATUS" ||
      error.code === "INVALID_MONTH" ||
      error.code === "INVALID_YEAR"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Internal server error while fetching permission requests",
    });
  }
}

module.exports = {
  getMyPermissionBalance,
  applyMyPermission,
  cancelMyPermission,
  getMyPermissionRequests,
  decideAdminPermission,
  getAdminPermissionRequests,
};
