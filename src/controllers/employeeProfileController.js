
const employeeProfileService = require(
  "../services/employeeProfileService"
);

// =====================================================
// GET MY EMPLOYEE PROFILE
// =====================================================

async function getMyEmployeeProfile(req, res) {
  try {
    const userId = req.user.id;

    const result =
      await employeeProfileService.getMyEmployeeProfile({
        userId,
      });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Get employee profile error:", error);

    if (error.code === "INVALID_EMPLOYEE_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (
      error.code === "EMPLOYEE_NOT_FOUND" ||
      error.code === "PROFILE_NOT_FOUND"
    ) {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching employee profile",
    });
  }
}

// =====================================================
// UPLOAD / REPLACE MY PROFILE PICTURE
// =====================================================

async function uploadMyProfilePicture(req, res) {
  try {
    const userId = req.user.id;

    const result =
      await employeeProfileService.uploadMyProfilePicture({
        userId,
        file: req.file,
      });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Upload profile picture error:", error);

    const badRequestErrors = [
      "PROFILE_PICTURE_REQUIRED",
      "FILE_TOO_LARGE",
      "INVALID_IMAGE_CONTENT",
      "IMAGE_TYPE_MISMATCH",
    ];

    if (badRequestErrors.includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "PROFILE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while uploading profile picture",
    });
  }
}

// =====================================================
// GET MY PROFILE PICTURE
// =====================================================

async function getMyProfilePicture(req, res) {
  try {
    const userId = req.user.id;

    const result =
      await employeeProfileService.getMyProfilePicture({
        userId,
      });

    res.set({
      "Content-Type": result.mimeType,
      "Content-Length": String(result.sizeBytes),
      "Content-Disposition": 'inline; filename="profile-picture"',
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    });

    return res.status(200).send(result.buffer);

  } catch (error) {
    console.error("Get profile picture error:", error);

    if (
      error.code === "PROFILE_NOT_FOUND" ||
      error.code === "PROFILE_PICTURE_NOT_FOUND" ||
      error.code === "PROFILE_PICTURE_FILE_NOT_FOUND"
    ) {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching profile picture",
    });
  }
}


// =====================================================
// SUBMIT PERSONAL DETAILS REQUEST
// =====================================================

async function submitPersonalDetailsRequest(req, res) {
  try {
    const userId = req.user.id;

    const result =
      await employeeProfileService.submitPersonalDetailsRequest({
        userId,
        personalDetails: req.body,
      });

    return res.status(201).json(result);

  } catch (error) {
    console.error("Submit personal details error:", error);

    const badRequestErrors = [
      "INVALID_PERSONAL_DETAILS",
      "EMPTY_PERSONAL_DETAILS",
      "INVALID_PERSONAL_FIELD",
      "INVALID_PERSONAL_FIELD_VALUE",
      "PERSONAL_REQUEST_ALREADY_PENDING",
    ];

    if (badRequestErrors.includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "PROFILE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while submitting personal details",
    });
  }
}


// =====================================================
// ADMIN: LIST PROFILE CHANGE REQUESTS
// =====================================================

async function getAdminProfileChangeRequests(req, res) {
  try {
    const result =
      await employeeProfileService.getAdminProfileChangeRequests({
        status: req.query.status || "PENDING",
        section: req.query.section,
        user_id: req.query.user_id,
        emp_code: req.query.emp_code,
        request_type: req.query.request_type,
        from_date: req.query.from_date,
        to_date: req.query.to_date,
        page: req.query.page || 1,
        limit: req.query.limit || 20,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Admin profile request list error:", error);

    const validationErrors = [
      "INVALID_REQUEST_STATUS",
      "INVALID_REQUEST_SECTION",
      "INVALID_REQUEST_TYPE",
      "INVALID_PAGINATION",
      "INVALID_USER_ID",
      "INVALID_EMP_CODE",
      "INVALID_DATE_FILTER",
      "INVALID_DATE_RANGE",
    ];

    if (validationErrors.includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching profile requests",
    });
  }
}


// =====================================================
// ADMIN: GET PROFILE CHANGE REQUEST DETAIL
// =====================================================

async function getAdminProfileChangeRequestById(req, res) {
  try {
    const result =
      await employeeProfileService.getAdminProfileChangeRequestById({
        requestId: req.params.id,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Admin profile request detail error:", error);

    if (error.code === "INVALID_REQUEST_ID") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "PROFILE_REQUEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching profile request",
    });
  }
}


// =====================================================
// ADMIN: APPROVE PERSONAL DETAILS REQUEST
// =====================================================

async function approvePersonalDetailsRequest(req, res) {
  try {
    const result =
      await employeeProfileService.approvePersonalDetailsRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: req.body.approval_remarks ?? null,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Approve personal details request error:", error);

    if (
      error.code === "INVALID_REQUEST_ID" ||
      error.code === "INVALID_APPROVAL_REMARKS" ||
      error.code === "UNSUPPORTED_PROFILE_REQUEST"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (
      error.code === "PROFILE_REQUEST_NOT_FOUND" ||
      error.code === "PROFILE_NOT_FOUND"
    ) {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "PROFILE_REQUEST_NOT_PENDING") {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (
      error.code === "INVALID_PERSONAL_DETAILS" ||
      error.code === "EMPTY_PERSONAL_DETAILS" ||
      error.code === "INVALID_PERSONAL_FIELD" ||
      error.code === "INVALID_PERSONAL_FIELD_VALUE"
    ) {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: "Stored request data is invalid and cannot be approved",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while approving profile request",
    });
  }
}


// =====================================================
// ADMIN: REJECT PERSONAL DETAILS REQUEST
// =====================================================

async function rejectPersonalDetailsRequest(req, res) {
  try {
    const result =
      await employeeProfileService.rejectPersonalDetailsRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: req.body.approval_remarks,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Reject personal details request error:", error);

    if (
      error.code === "INVALID_REQUEST_ID" ||
      error.code === "INVALID_APPROVAL_REMARKS" ||
      error.code === "UNSUPPORTED_PROFILE_REQUEST"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "PROFILE_REQUEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === "PROFILE_REQUEST_NOT_PENDING") {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while rejecting profile request",
    });
  }
}


module.exports = {
  getMyEmployeeProfile,
  uploadMyProfilePicture,
  getMyProfilePicture,
  submitPersonalDetailsRequest,
  getAdminProfileChangeRequests,
  getAdminProfileChangeRequestById,
  approvePersonalDetailsRequest,
  rejectPersonalDetailsRequest
};

