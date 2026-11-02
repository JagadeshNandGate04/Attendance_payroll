const express = require('express');

const router = express.Router();

// SETTINGS VALIDATOR

function validateSettingValue(
  key,
  value
) {

  // SHIFT

  if (key === "shift") {

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.start !== "string" ||
      typeof value.end !== "string"
    ) {

      const error = new Error(
        "shift must contain start and end times"
      );

      error.code =
        "INVALID_SETTING_VALUE";

      error.key = key;

      throw error;
    }

    return;
  }


  // WEEKLY OFF DAYS

  if (key === "weekly_off_days") {

    if (
      !Array.isArray(value) ||
      value.some(
        (day) =>
          !Number.isInteger(day) ||
          day < 0 ||
          day > 6
      )
    ) {

      const error = new Error(
        "weekly_off_days must contain numbers from 0 to 6"
      );

      error.code =
        "INVALID_SETTING_VALUE";

      error.key = key;

      throw error;
    }

    return;
  }


  // PAYROLL DIVISOR

  if (key === "payroll_divisor") {

    if (
      typeof value !== "string" ||
      value !== "CALENDAR_DAYS"
    ) {

      const error = new Error(
        "payroll_divisor must be CALENDAR_DAYS"
      );

      error.code =
        "INVALID_SETTING_VALUE";

      error.key = key;

      throw error;
    }

    return;
  }


  // NUMERIC SETTINGS

  const numericKeys = [
    "break_allowance_min",
    "grace_min",
    "full_day_hours",
    "half_day_hours",
    "duplicate_punch_window_min",
    "permission_monthly_min",
    "permission_unit_min",
    "leave_monthly_accrual",
    "leave_balance_cap"
  ];


  if (numericKeys.includes(key)) {

    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0
    ) {

      const error = new Error(
        `${key} must be a non-negative number`
      );

      error.code =
        "INVALID_SETTING_VALUE";

      error.key = key;

      throw error;
    }
  }
}

module.exports = {
  validateSettingValue
};