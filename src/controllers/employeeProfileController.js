
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
      return res.status(400).json({
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
      return res.status(400).json({
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
        approvalRemarks: req.body?.approval_remarks,
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
      return res.status(400).json({
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



// =====================================================
// EMPLOYEE: GET MY ADDRESSES
// =====================================================

async function getMyAddresses(req, res) {
  try {
    const result = await employeeProfileService.getMyAddresses({
      userId: req.user.id,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get employee addresses error:", error);

    if (error.code === "PROFILE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching addresses",
    });
  }
}


// =====================================================
// EMPLOYEE: SUBMIT ADDRESS REQUEST
// =====================================================

async function submitAddressRequest(req, res) {
  try {
    const result = await employeeProfileService.submitAddressRequest({
      userId: req.user.id,
      addressData: req.body,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("Submit address request error:", error);

    const badRequestErrors = [
      "INVALID_ADDRESS_DATA",
      "INVALID_ADDRESS_TYPE",
      "INVALID_ADDRESS_FIELD",
      "MISSING_ADDRESS_FIELD",
      "INVALID_ADDRESS_FIELD_VALUE",
      "ADDRESS_REQUEST_ALREADY_PENDING",
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
      message: "Internal server error while submitting address request",
    });
  }
}


// =====================================================
// ADMIN: APPROVE ADDRESS REQUEST
// =====================================================

async function approveAddressRequest(req, res) {
  try {
    const result =
      await employeeProfileService.approveAddressRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: req.body.approval_remarks ?? null,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Approve address request error:", error);

    const badRequestErrors = [
      "INVALID_REQUEST_ID",
      "INVALID_APPROVAL_REMARKS",
      "UNSUPPORTED_PROFILE_REQUEST",
      "INVALID_ADDRESS_REQUEST_DATA",
      "INVALID_ADDRESS_TYPE",
      "INVALID_ADDRESS_FIELD",
      "MISSING_ADDRESS_FIELD",
      "INVALID_ADDRESS_FIELD_VALUE",
    ];

    if (badRequestErrors.includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (
      error.code === "PROFILE_REQUEST_NOT_FOUND" ||
      error.code === "PROFILE_NOT_FOUND" ||
      error.code === "ADDRESS_NOT_FOUND"
    ) {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (
      error.code === "PROFILE_REQUEST_NOT_PENDING" ||
      error.code === "ADDRESS_ALREADY_EXISTS"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while approving address request",
    });
  }
}


// =====================================================
// ADMIN: REJECT ADDRESS REQUEST
// =====================================================

async function rejectAddressRequest(req, res) {
  try {
    const result =
      await employeeProfileService.rejectAddressRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: req.body.approval_remarks,
      });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Reject address request error:", error);

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
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while rejecting address request",
    });
  }
}



// =====================================================
// EMPLOYEE: GET MY EMERGENCY CONTACTS
// =====================================================

async function getMyEmergencyContacts(req, res) {
  try {
    const result =
      await employeeProfileService.getMyEmergencyContacts({
        userId: req.user.id,
      });

    return res.status(200).json({
      success: true,
      message: "Emergency contacts fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get emergency contacts error:", error);

    return res.status(
      error.code === "PROFILE_NOT_FOUND" ? 404 : 500
    ).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to fetch emergency contacts",
      data: null,
    });
  }
}

// =====================================================
// EMPLOYEE: SUBMIT EMERGENCY CONTACT REQUEST
// =====================================================

async function submitEmergencyContactRequest(req, res) {
  try {
    const result =
      await employeeProfileService.submitEmergencyContactRequest({
        userId: req.user.id,
        contactData: req.body,
      });

    return res.status(201).json({
      success: true,
      message: "Emergency contact request submitted successfully",
      data: result,
    });
  } catch (error) {
    console.error("Submit emergency contact request error:", error);

    const badRequestErrors = [
      "INVALID_EMERGENCY_CONTACT_DATA",
      "EMPTY_EMERGENCY_CONTACT_DATA",
      "INVALID_EMERGENCY_CONTACT_FIELD",
      "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
      "MISSING_EMERGENCY_CONTACT_NAME",
      "MISSING_EMERGENCY_CONTACT_MOBILE",
      "INVALID_EMERGENCY_CONTACT_REQUEST_TYPE",
      "INVALID_EMERGENCY_CONTACT_ID",
      "EMERGENCY_CONTACT_REQUEST_ALREADY_PENDING",
    ];

    let statusCode = 500;

    if (badRequestErrors.includes(error.code)) {
      statusCode = 400;
    } else if (error.code === "PROFILE_NOT_FOUND") {
      statusCode = 404;
    } else if (
      error.code === "EMERGENCY_CONTACT_NOT_FOUND"
    ) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to submit emergency contact request",
      data: null,
    });
  }
}

// =====================================================
// ADMIN: APPROVE EMERGENCY CONTACT REQUEST
// =====================================================

async function approveEmergencyContactRequest(req, res) {
  try {
    const { approval_remarks = null } = req.body;

    const result =
      await employeeProfileService.approveEmergencyContactRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: approval_remarks,
      });

    return res.status(200).json({
      success: true,
      message: "Emergency contact request approved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Approve emergency contact request error:", error);

    const badRequestErrors = [
      "INVALID_APPROVAL_REMARKS",
      "INVALID_EMERGENCY_CONTACT_DATA",
      "EMPTY_EMERGENCY_CONTACT_DATA",
      "INVALID_EMERGENCY_CONTACT_FIELD",
      "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
      "MISSING_EMERGENCY_CONTACT_NAME",
      "MISSING_EMERGENCY_CONTACT_MOBILE",
      "UNSUPPORTED_EMERGENCY_CONTACT_REQUEST",
    ];

    let statusCode = 500;

    if (badRequestErrors.includes(error.code)) {
      statusCode = 400;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_FOUND" ||
      error.code === "PROFILE_NOT_FOUND" ||
      error.code === "EMERGENCY_CONTACT_NOT_FOUND"
    ) {
      statusCode = 404;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_PENDING" ||
      error.code === "EMERGENCY_CONTACT_NOT_ACTIVE"
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to approve emergency contact request",
      data: null,
    });
  }
}

// =====================================================
// ADMIN: REJECT EMERGENCY CONTACT REQUEST
// =====================================================

async function rejectEmergencyContactRequest(req, res) {
  try {
    const { approval_remarks } = req.body;

    const result =
      await employeeProfileService.rejectEmergencyContactRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: approval_remarks,
      });

    return res.status(200).json({
      success: true,
      message: "Emergency contact request rejected successfully",
      data: result,
    });
  } catch (error) {
    console.error("Reject emergency contact request error:", error);

    let statusCode = 500;

    if (error.code === "INVALID_APPROVAL_REMARKS") {
      statusCode = 400;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_FOUND"
    ) {
      statusCode = 404;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_PENDING"
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to reject emergency contact request",
      data: null,
    });
  }
}


// =====================================================
// EMPLOYEE: GET MY FAMILY MEMBERS
// =====================================================

async function getMyFamilyMembers(req, res) {
  try {
    const result =
      await employeeProfileService.getMyFamilyMembers({
        userId: req.user.id,
      });

    return res.status(200).json({
      success: true,
      message: "Family members fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get family members error:", error);

    return res.status(
      error.code === "PROFILE_NOT_FOUND" ? 404 : 500
    ).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to fetch family members",
      data: null,
    });
  }
}

// =====================================================
// EMPLOYEE: SUBMIT FAMILY MEMBER REQUEST
// =====================================================

async function submitFamilyMemberRequest(req, res) {
  try {
    const result =
      await employeeProfileService.submitFamilyMemberRequest({
        userId: req.user.id,
        familyMemberData: req.body,
      });

    return res.status(201).json({
      success: true,
      message: "Family member request submitted successfully",
      data: result,
    });
  } catch (error) {
    console.error("Submit family member request error:", error);

    const badRequestErrors = [
      "INVALID_FAMILY_MEMBER_DATA",
      "EMPTY_FAMILY_MEMBER_DATA",
      "INVALID_FAMILY_MEMBER_FIELD",
      "INVALID_FAMILY_MEMBER_FIELD_VALUE",
      "INVALID_FAMILY_MEMBER_TYPE",
      "MISSING_FAMILY_MEMBER_FIELD",
      "INVALID_FAMILY_MEMBER_REQUEST_TYPE",
      "INVALID_FAMILY_MEMBER_ID",
      "FAMILY_MEMBER_REQUEST_ALREADY_PENDING",
    ];

    let statusCode = 500;

    if (badRequestErrors.includes(error.code)) {
      statusCode = 400;
    } else if (
      error.code === "PROFILE_NOT_FOUND" ||
      error.code === "FAMILY_MEMBER_NOT_FOUND"
    ) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to submit family member request",
      data: null,
    });
  }
}

// =====================================================
// ADMIN: APPROVE FAMILY MEMBER REQUEST
// =====================================================

async function approveFamilyMemberRequest(req, res) {
  try {
    const { approval_remarks = null } = req.body;

    const result =
      await employeeProfileService.approveFamilyMemberRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: approval_remarks,
      });

    return res.status(200).json({
      success: true,
      message: "Family member request approved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Approve family member request error:", error);

    const badRequestErrors = [
      "INVALID_APPROVAL_REMARKS",
      "INVALID_FAMILY_MEMBER_DATA",
      "EMPTY_FAMILY_MEMBER_DATA",
      "INVALID_FAMILY_MEMBER_FIELD",
      "INVALID_FAMILY_MEMBER_FIELD_VALUE",
      "INVALID_FAMILY_MEMBER_TYPE",
      "MISSING_FAMILY_MEMBER_FIELD",
      "UNSUPPORTED_FAMILY_MEMBER_REQUEST",
    ];

    let statusCode = 500;

    if (badRequestErrors.includes(error.code)) {
      statusCode = 400;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_FOUND" ||
      error.code === "PROFILE_NOT_FOUND" ||
      error.code === "FAMILY_MEMBER_NOT_FOUND"
    ) {
      statusCode = 404;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_PENDING" ||
      error.code === "FAMILY_MEMBER_NOT_ACTIVE"
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to approve family member request",
      data: null,
    });
  }
}

// =====================================================
// ADMIN: REJECT FAMILY MEMBER REQUEST
// =====================================================

async function rejectFamilyMemberRequest(req, res) {
  try {
    const { approval_remarks } = req.body;

    const result =
      await employeeProfileService.rejectFamilyMemberRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: approval_remarks,
      });

    return res.status(200).json({
      success: true,
      message: "Family member request rejected successfully",
      data: result,
    });
  } catch (error) {
    console.error("Reject family member request error:", error);

    let statusCode = 500;

    if (error.code === "INVALID_APPROVAL_REMARKS") {
      statusCode = 400;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_FOUND"
    ) {
      statusCode = 404;
    } else if (
      error.code === "PROFILE_CHANGE_REQUEST_NOT_PENDING"
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to reject family member request",
      data: null,
    });
  }
}



// =====================================================
// EMPLOYEE: GET MY QUALIFICATIONS
// =====================================================

async function getMyQualifications(req, res) {
  try {
    const result = await employeeProfileService.getMyQualifications({
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Qualifications fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get my qualifications error:", error);

    return res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch qualifications.",
      data: null,
    });
  }
}

// =====================================================
// EMPLOYEE: SUBMIT QUALIFICATION REQUEST
// =====================================================

async function submitQualificationRequest(req, res) {
  try {
    const result =
      await employeeProfileService.submitQualificationRequest({
        userId: req.user.id,
        qualificationData: req.body,
      });

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    console.error("Submit qualification request error:", error);

    const validationErrors = [
      "INVALID_QUALIFICATION_DATA",
      "EMPTY_QUALIFICATION_DATA",
      "INVALID_QUALIFICATION_FIELDS",
      "INVALID_QUALIFICATION_YEAR",
      "REQUIRED_QUALIFICATION_FIELD",
      "INVALID_QUALIFICATION_FIELD",
      "QUALIFICATION_FIELD_TOO_LONG",
      "INVALID_QUALIFICATION_YEAR_RANGE",
      "INVALID_REQUEST_TYPE",
      "INVALID_QUALIFICATION_ID",
      "INVALID_DELETE_DATA",
    ];

    if (validationErrors.includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    if (error.code === "QUALIFICATION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    if (error.code === "QUALIFICATION_REQUEST_ALREADY_PENDING") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to submit qualification request.",
      data: null,
    });
  }
}

// =====================================================
// ADMIN: APPROVE QUALIFICATION REQUEST
// =====================================================

async function approveQualificationRequest(req, res) {
  try {
    const result =
      await employeeProfileService.approveQualificationRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: req.body.approval_remarks || null,
      });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    console.error("Approve qualification request error:", error);

    if (error.code === "QUALIFICATION_REQUEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    if (
      error.code === "QUALIFICATION_REQUEST_NOT_PENDING" ||
      error.code === "QUALIFICATION_NOT_FOUND"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    if (
      [
        "INVALID_QUALIFICATION_DATA",
        "EMPTY_QUALIFICATION_DATA",
        "INVALID_QUALIFICATION_FIELDS",
        "INVALID_QUALIFICATION_YEAR",
        "REQUIRED_QUALIFICATION_FIELD",
        "INVALID_QUALIFICATION_FIELD",
        "QUALIFICATION_FIELD_TOO_LONG",
        "INVALID_QUALIFICATION_YEAR_RANGE",
        "INVALID_REQUEST_TYPE",
      ].includes(error.code)
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to approve qualification request.",
      data: null,
    });
  }
}

// =====================================================
// ADMIN: REJECT QUALIFICATION REQUEST
// =====================================================

async function rejectQualificationRequest(req, res) {
  try {
    const result =
      await employeeProfileService.rejectQualificationRequest({
        requestId: req.params.id,
        adminId: req.user.id,
        approvalRemarks: req.body.approval_remarks,
      });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    console.error("Reject qualification request error:", error);

    if (
      error.code === "APPROVAL_REMARKS_REQUIRED" ||
      error.code === "INVALID_APPROVAL_REMARKS"
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    if (error.code === "QUALIFICATION_REQUEST_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    if (error.code === "QUALIFICATION_REQUEST_NOT_PENDING") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to reject qualification request.",
      data: null,
    });
  }
}


 // =====================================================
 // WORK EXPERIENCE CONTROLLERS
 // =====================================================

// EMPLOYEE - GET WORK EXPERIENCES
async function getMyWorkExperiences(req, res) {
  try {
    const data = await employeeProfileService.getMyWorkExperiences({
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Work experiences fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get work experiences error:", error);

    return res.status(500).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to fetch work experiences",
      data: null,
    });
  }
}

// EMPLOYEE - SUBMIT WORK EXPERIENCE REQUEST
async function submitWorkExperienceRequest(req, res) {
  try {
    const request = await employeeProfileService.submitWorkExperienceRequest({
      userId: req.user.id,
      experienceData: req.body,
    });

    return res.status(201).json({
      success: true,
      message: "Work experience request submitted successfully",
      data: request,
    });
  } catch (error) {
    console.error("Submit work experience request error:", error);

    const statusCode =
      error.code === "USER_NOT_FOUND" ||
      error.code === "WORK_EXPERIENCE_NOT_FOUND" ||
      error.code === "REQUEST_NOT_FOUND"
        ? 404
        : error.code === "PENDING_REQUEST_EXISTS" ||
          error.code === "REQUEST_ALREADY_REVIEWED"
        ? 400
        : error.code === "VALIDATION_ERROR"
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to submit work experience request",
      data: null,
    });
  }
}

// ADMIN - APPROVE WORK EXPERIENCE REQUEST
async function approveWorkExperienceRequest(req, res) {
  try {
    const request = await employeeProfileService.approveWorkExperienceRequest({
      requestId: req.params.id,
      adminId: req.user.id,
      approvalRemarks: req.body.approval_remarks || null,
    });

    return res.status(200).json({
      success: true,
      message: "Work experience request approved successfully",
      data: request,
    });
  } catch (error) {
    console.error("Approve work experience request error:", error);

    const statusCode =
      error.code === "REQUEST_NOT_FOUND" ||
      error.code === "WORK_EXPERIENCE_NOT_FOUND"
        ? 404
        : error.code === "REQUEST_ALREADY_REVIEWED"
        ? 400
        : error.code === "VALIDATION_ERROR"
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to approve work experience request",
      data: null,
    });
  }
}

// ADMIN - REJECT WORK EXPERIENCE REQUEST
async function rejectWorkExperienceRequest(req, res) {
  try {
    const request = await employeeProfileService.rejectWorkExperienceRequest({
      requestId: req.params.id,
      adminId: req.user.id,
      approvalRemarks: req.body.approval_remarks,
    });

    return res.status(200).json({
      success: true,
      message: "Work experience request rejected successfully",
      data: request,
    });
  } catch (error) {
    console.error("Reject work experience request error:", error);

    const statusCode =
      error.code === "REQUEST_NOT_FOUND" ? 404 : 400;

    return res.status(statusCode).json({
      success: false,
      error: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message || "Failed to reject work experience request",
      data: null,
    });
  }
}



// =====================================================
// ADMIN - UPDATE EMPLOYEE DESIGNATION
// =====================================================

async function updateEmployeeDesignation(req, res) {
  try {
    const result =
      await employeeProfileService.updateEmployeeDesignation({
        userId: req.params.userId,
        adminId: req.user.id,
        designation: req.body.designation,
        effective_date: req.body.effective_date,
        remarks: req.body.remarks,
      });

    return res.status(200).json({
      success: true,
      message: "Employee designation updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update employee designation error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message,
      message: error.message || "Failed to update employee designation",
      data: null,
    });
  }
}

// =====================================================
// ADMIN - GET EMPLOYEE DESIGNATION HISTORY
// =====================================================

async function getEmployeeDesignationHistory(req, res) {
  try {
    const result =
      await employeeProfileService.getEmployeeDesignationHistory({
        userId: req.params.userId,
      });

    return res.status(200).json({
      success: true,
      message: "Employee designation history fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get employee designation history error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message,
      message: error.message || "Failed to fetch designation history",
      data: null,
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
  rejectPersonalDetailsRequest,
  getMyAddresses,
  submitAddressRequest,
  approveAddressRequest,
  rejectAddressRequest,
  getMyEmergencyContacts,
  submitEmergencyContactRequest,
  approveEmergencyContactRequest,
  rejectEmergencyContactRequest,
   getMyFamilyMembers,
   submitFamilyMemberRequest,
   approveFamilyMemberRequest,
   submitQualificationRequest,
   getMyQualifications,
   rejectFamilyMemberRequest,
   approveQualificationRequest,
   rejectQualificationRequest,
   getMyWorkExperiences,
   submitWorkExperienceRequest,
   approveWorkExperienceRequest,
   rejectWorkExperienceRequest,
   updateEmployeeDesignation,
   getEmployeeDesignationHistory,
};
