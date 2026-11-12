
const express = require("express");

const router = express.Router();
const { uploadProfilePicture } = require("../middleware/profilePictureUpload");
const employeeProfileController = require(
  "../controllers/employeeProfileController"
);
const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

const {
  userAuthorize,
} = require("../middleware/auth");

// GET MY EMPLOYEE PROFILE
router.get(
  "/me",
  userAuthorize(),
  employeeProfileController.getMyEmployeeProfile
);

// UPLOAD / REPLACE PROFILE PICTURE
router.post(
  "/me/profile-picture",
  userAuthorize(),
  uploadProfilePicture,
  employeeProfileController.uploadMyProfilePicture
);

// GET MY PROFILE PICTURE
router.get(
  "/me/profile-picture",
  userAuthorize(),
  employeeProfileController.getMyProfilePicture
);

// SUBMIT PERSONAL DETAILS FOR ADMIN APPROVAL
router.post(
  "/me/personal-details/request",
  userAuthorize(),
  employeeProfileController.submitPersonalDetailsRequest
);



// =====================================================
// ADMIN EMPLOYEE PROFILE APPROVAL ROUTES
// =====================================================

// GET PROFILE CHANGE REQUESTS
router.get(
  "/admin/requests",
  adminAuthorize(),
  employeeProfileController.getAdminProfileChangeRequests
);

// GET SINGLE PROFILE CHANGE REQUEST
router.get(
  "/admin/requests/:id",
  adminAuthorize(),
  employeeProfileController.getAdminProfileChangeRequestById
);

// APPROVE PERSONAL DETAILS REQUEST
router.patch(
  "/admin/requests/:id/approve",
  adminAuthorize(),
  employeeProfileController.approvePersonalDetailsRequest
);

// REJECT PERSONAL DETAILS REQUEST
router.patch(
  "/admin/requests/:id/reject",
  adminAuthorize(),
  employeeProfileController.rejectPersonalDetailsRequest
);

module.exports = router;
