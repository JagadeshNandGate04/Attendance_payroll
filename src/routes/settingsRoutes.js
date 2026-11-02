const express = require('express');
const router = express.Router();

const adminAuthorize =
  require('../middleware/admin').adminAuthorize;

  const settingsController = require('../controllers/settingsController')

router.get(
  "/get/settings",
  adminAuthorize(),
  settingsController.getSettings
);

router.put(
  "/update/settings",
  adminAuthorize(),
  settingsController.updateSettings
);

router.get("/getHolidays", adminAuthorize(), settingsController.getHolidays);

router.post("/createHoliday", adminAuthorize(), settingsController.createHoliday);

router.delete(
  "/deleteHoliday/:id",
  adminAuthorize(),
  settingsController.deleteHoliday
);


module.exports = router;
