const settingsService = require("../services/settingsService");

// GET SETTINGS

async function getSettings(req, res) {
  try {
    const result = await settingsService.getSettings();

    return res.status(200).json(result);
  } catch (error) {
    console.error("Get settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching settings",
    });
  }
}

// UPDATE SETTINGS

async function updateSettings(req, res) {
  try {
    const adminId = req.user.id;

    const { settings } = req.body;

    const result = await settingsService.updateSettings({
      adminId,
      settings,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Update settings error:", error);

    // INVALID SETTINGS

    if (error.code === "INVALID_SETTINGS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID SETTING KEY

    if (error.code === "INVALID_SETTING_KEY") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // INVALID SETTING VALUE

    if (error.code === "INVALID_SETTING_VALUE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          key: error.key,
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while updating settings",
    });
  }
}

// GET HOLIDAYS

async function getHolidays(req, res) {
  try {
    const result = await settingsService.getHolidays({ year: req.query.year });
    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(400)
      .json({
        success: false,
        code: error.code || "GET_HOLIDAYS_FAILED",
        message: error.message,
      });
  }
}

// CREATE HOLIDAYS

async function createHoliday(req, res) {
  try {
    const result = await settingsService.createHoliday({
      adminId: req.user.id,
      holiday_date: req.body.holiday_date,
      name: req.body.name,
    });
    return res.status(201).json(result);
  } catch (error) {
    let statusCode = 400;
    if (error.code === "MONTH_LOCKED") {
      statusCode = 409;
    }
    if (error.code === "HOLIDAY_ALREADY_EXISTS") {
      statusCode = 409;
    }
    return res
      .status(statusCode)
      .json({
        success: false,
        code: error.code || "CREATE_HOLIDAY_FAILED",
        message: error.message,
      });
  }
}

// DELETE HOLIDAYS

async function deleteHoliday(req, res) {
  try {
    const result = await settingsService.deleteHoliday({
      adminId: req.user.id,
      holidayId: req.params.id,
    });
    return res.status(200).json(result);
  } catch (error) {
    let statusCode = 400;
    if (error.code === "MONTH_LOCKED") {
      statusCode = 409;
    }
    if (error.code === "HOLIDAY_NOT_FOUND") {
      statusCode = 404;
    }
    return res
      .status(statusCode)
      .json({
        success: false,
        code: error.code || "DELETE_HOLIDAY_FAILED",
        message: error.message,
      });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  deleteHoliday,
  createHoliday,
  getHolidays,
};
