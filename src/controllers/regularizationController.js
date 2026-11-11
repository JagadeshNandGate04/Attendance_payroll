const regularizationService = require("../services/RegularizationService");

// =====================================================
// EMPLOYEE - APPLY REGULARIZATION
// =====================================================

async function applyMyRegularization(req, res) {
  try {
    const userId = req.user.id;

    const {
      work_date,
      type,
      claimed_in,
      claimed_out,
      reason,
    } = req.body;

    const result = await regularizationService.applyMyRegularization({
      userId,
      workDate: work_date,
      type,
      claimedIn: claimed_in,
      claimedOut: claimed_out,
      reason,
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error("Apply regularization error:", error);

    if (
      error.code === "INVALID_DATE" ||
      error.code === "INVALID_TYPE" ||
      error.code === "INVALID_CLAIMED_IN" ||
      error.code === "INVALID_CLAIMED_OUT" ||
      error.code === "INVALID_REASON" ||
      error.code === "MISSING_CLAIMED_IN" ||
      error.code === "MISSING_CLAIMED_OUT" ||
      error.code === "INVALID_TIME_ORDER" ||
      error.code === "NO_PUNCH_CONTEXT" ||
      error.code === "REGULARIZATION_EXISTS"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "MONTH_LOCKED") {
      return res.status(409).json({
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
      message: "Internal server error while applying regularization",
    });
  }
}

// =====================================================
// EMPLOYEE - GET MY REGULARIZATION REQUESTS
// =====================================================

async function getMyRegularizations(req, res) {
  try {
    const userId = req.user.id;

    const { month, year } = req.query;

    const result = await regularizationService.getMyRegularizations({
      userId,
      month,
      year,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get my regularizations error:", error);

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
      message: "Internal server error while fetching regularization requests",
    });
  }
}

// =====================================================
// ADMIN - GET REGULARIZATION REQUESTS
// =====================================================

async function getAdminRegularizationRequests(req, res) {
  try {
    const { status } = req.query;

    const result =
      await regularizationService.getAdminRegularizationRequests({
        status,
      });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get admin regularization requests error:", error);

    if (error.code === "INVALID_STATUS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching regularization requests",
    });
  }
}

// =====================================================
// ADMIN - APPROVE / REJECT REGULARIZATION
// =====================================================

async function decideAdminRegularization(req, res) {
  try {
    const adminId = req.user.id;

    const regularizationRequestId = req.params.id;

    const { action, note } = req.body;

    const result =
      await regularizationService.decideAdminRegularization({
        adminId,
        regularizationRequestId,
        action,
        note,
      });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Admin decide regularization error:", error);

    if (
      error.code === "INVALID_REGULARIZATION_ID" ||
      error.code === "INVALID_ACTION" ||
      error.code === "INVALID_NOTE" ||
      error.code === "REGULARIZATION_NOT_FOUND"
    ) {
      return res
        .status(
          error.code === "REGULARIZATION_NOT_FOUND" ? 404 : 400
        )
        .json({
          success: false,
          error: error.code,
          message: error.message,
        });
    }

    if (error.code === "REGULARIZATION_NOT_DECIDABLE") {
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
      return res.status(409).json({
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
      message: "Internal server error while deciding regularization",
    });
  }
}

// =====================================================
// EMPLOYEE - GET MY REGULARIZATION REQUESTS
// =====================================================

async function getMyRegularizationsRequest(req, res) {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;

    const result = await regularizationService.getMyRegularizationsRequest({
      userId,
      month,
      year,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get my regularizations error:", error);

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
      message: "Internal server error while fetching regularization requests",
    });
  }
}// =====================================================
// EMPLOYEE - GET MY REGULARIZATION REQUESTS
// =====================================================

async function getMyRegularizations(req, res) {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;

    const result = await regularizationService.getMyRegularizations({
      userId,
      month,
      year,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get my regularizations error:", error);

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
      message: "Internal server error while fetching regularization requests",
    });
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  applyMyRegularization,
  getMyRegularizations,
  getMyRegularizationsRequest,
  getAdminRegularizationRequests,
  decideAdminRegularization,
};