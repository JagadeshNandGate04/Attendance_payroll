const settingsService = require("../services/settingsService");
const workdaySwapService = require("../services/WorkdaySwapService");

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
      statusCode = 404;
    }
    if (error.code === "HOLIDAY_ALREADY_EXISTS") {
      statusCode = 404;
    }
    if (error.code === "HOLIDAY_WORKDAY_SWAP_CONFLICT") {
      statusCode = 400;
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
      statusCode = 404;
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

async function getWorkdaySwaps(req, res) {
  try {
    const result = await workdaySwapService.getWorkdaySwaps({
      year: req.query.year,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Get workday swaps error:", error);
    return res.status(400).json({
      success: false,
      code: error.code || "GET_WORKDAY_SWAPS_FAILED",
      message: error.message,
    });
  }
}

async function createWorkdaySwap(req, res) {
  try {
   const result = await workdaySwapService.createWorkdaySwap({
  adminId: req.user.id,
  holiday_date: req.body.holiday_date,
  replacement_date: req.body.replacement_date,
  user_ids: req.body.user_ids,
  reason: req.body.reason,
});
    return res.status(201).json(result);
  } catch (error) {
    console.error("Create workday swap error:", error);
    const conflictErrors = [
      "MONTH_LOCKED",
      "WORKDAY_SWAP_CONFLICT",
      "HOLIDAY_DATE_CONFLICT",
    ];
    const statusCode = error.code === "ADMIN_NOT_FOUND"
      ? 403
      : conflictErrors.includes(error.code)
        ? 400
        : 400;

    return res.status(statusCode).json({
      success: false,
      code: error.code || "CREATE_WORKDAY_SWAP_FAILED",
      message: error.message,
    });
  }
}

async function deleteWorkdaySwap(req, res) {
  try {
    const result = await workdaySwapService.deleteWorkdaySwap({
      adminId: req.user.id,
      swapId: req.params.id,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Delete workday swap error:", error);
    const statusCode = error.code === "WORKDAY_SWAP_NOT_FOUND"
      ? 404
      : error.code === "ADMIN_NOT_FOUND"
        ? 403
        : error.code === "MONTH_LOCKED" ||
            error.code === "WORKDAY_SWAP_CONFLICT"
          ? 400
          : 400;

    return res.status(statusCode).json({
      success: false,
      code: error.code || "DELETE_WORKDAY_SWAP_FAILED",
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
  getWorkdaySwaps,
  createWorkdaySwap,
  deleteWorkdaySwap,
};
