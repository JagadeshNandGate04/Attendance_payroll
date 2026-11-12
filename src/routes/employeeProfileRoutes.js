
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



// =====================================================
// EMPLOYEE ADDRESS ROUTES
// =====================================================

// GET MY ADDRESSES
router.get(
  "/me/addresses",
  userAuthorize(),
  employeeProfileController.getMyAddresses
);

// SUBMIT ADDRESS CHANGE REQUEST
router.post(
  "/me/addresses/request",
  userAuthorize(),
  employeeProfileController.submitAddressRequest
);


// =====================================================
// ADMIN ADDRESS APPROVAL ROUTES
// =====================================================

// APPROVE ADDRESS REQUEST
router.patch(
  "/admin/requests/:id/address/approve",
  adminAuthorize(),
  employeeProfileController.approveAddressRequest
);

// REJECT ADDRESS REQUEST
router.patch(
  "/admin/requests/:id/address/reject",
  adminAuthorize(),
  employeeProfileController.rejectAddressRequest
);


// =====================================================
// EMPLOYEE EMERGENCY CONTACT ROUTES
// =====================================================

router.get(
  "/me/emergency-contacts",
  userAuthorize(),
  employeeProfileController.getMyEmergencyContacts
);

router.post(
  "/me/emergency-contacts/request",
  userAuthorize(),
  employeeProfileController.submitEmergencyContactRequest
);


// =====================================================
// ADMIN EMERGENCY CONTACT APPROVAL ROUTES
// =====================================================

router.patch(
  "/admin/requests/:id/emergency-contact/approve",
  adminAuthorize(),
  employeeProfileController.approveEmergencyContactRequest
);

router.patch(
  "/admin/requests/:id/emergency-contact/reject",
  adminAuthorize(),
  employeeProfileController.rejectEmergencyContactRequest
);


// =====================================================
// EMPLOYEE FAMILY MEMBER ROUTES
// =====================================================

router.get(
  "/me/family-members",
  userAuthorize(),
  employeeProfileController.getMyFamilyMembers
);

router.post(
  "/me/family-members/request",
  userAuthorize(),
  employeeProfileController.submitFamilyMemberRequest
);



// =====================================================
// ADMIN FAMILY MEMBER APPROVAL ROUTES
// =====================================================

router.patch(
  "/admin/requests/:id/family-member/approve",
  adminAuthorize(),
  employeeProfileController.approveFamilyMemberRequest
);

router.patch(
  "/admin/requests/:id/family-member/reject",
  adminAuthorize(),
  employeeProfileController.rejectFamilyMemberRequest
);


module.exports = router;
