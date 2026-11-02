const express =
  require('express');

const router =
  express.Router();

const regularizationController =
  require('../controllers/regularizationController');


const {
  userAuthorize
} = require('../middleware/auth');


const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

  router.post('/me/apply', userAuthorize(), regularizationController.applyMyRegularization);
  router.get('/me', userAuthorize(), regularizationController.getMyRegularizations);
  router.get('/admin/requests', adminAuthorize(), regularizationController.getAdminRegularizationRequests)
  router.post('/admin/:id/decide', adminAuthorize(), regularizationController.decideAdminRegularization)

module.exports =
  router;