const attendanceService =
  require('../services/AttendanceService');



//  EMPLOYEE MONTHLY ATTENDANCE


async function getMyAttendance(req, res) {
  try {

    const {
      month,
      year
    } = req.query;


    // userAuthorize middleware provides req.user
    const userId =
      req.user.id;

    const empCode =
      req.user.emp_code;


    const result =
      await attendanceService.getMyAttendance({
        userId,
        empCode,
        month,
        year
      });


    return res
      .status(200)
      .json(result);

  } catch (error) {

    console.error(
      'Get my attendance error:',
      error
    );

    if (
      error.message === 'Month and year are required' ||
      error.message === 'Invalid month' ||
      error.message === 'Invalid year'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Internal server error while fetching attendance'
    });
  }
}



//EMPLOYEE ATTENDANCE FOR A SPECIFIC DAY


async function getMyAttendanceDay(req, res) {
  try {

    const {
      date
    } = req.query;


    // userAuthorize middleware provides req.user
    const userId =
      req.user.id;

    const empCode =
      req.user.emp_code;


    const result =
      await attendanceService.getMyAttendanceDay({
        userId,
        empCode,
        date
      });


    return res
      .status(200)
      .json(result);

  } catch (error) {

    console.error(
      'Get my attendance day error:',
      error
    );


    if (
      error.message === 'Date is required' ||
      error.message ===
        'Invalid date format. Use YYYY-MM-DD' ||
      error.message === 'Invalid date'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Internal server error while fetching attendance details'
    });
  }
}



// ADMIN => DAILY ATTENDANCE


async function getAdminDailyAttendance(req, res) {
  try {

    const {
      date
    } = req.query;


    const result =
      await attendanceService.getAdminDailyAttendance({
        date
      });


    return res
      .status(200)
      .json(result);

  } catch (error) {

    console.error(
      'Get admin daily attendance error:',
      error
    );

    if (
      error.message === 'Date is required' ||
      error.message ===
        'Invalid date format. Use YYYY-MM-DD' ||
      error.message === 'Invalid date'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Internal server error while fetching daily attendance'
    });
  }
}


// ADMIN => MONTHLY EMPLOOYEE ATTENDANCE


async function getAdminMonthlyAttendance(req, res) {
  try {

    const {
      user_id,
      month,
      year
    } = req.query;


    const result =
      await attendanceService.getAdminMonthlyAttendance({
        userId: user_id,
        month,
        year
      });


    return res
      .status(200)
      .json(result);

  } catch (error) {

    console.error(
      'Get admin monthly attendance error:',
      error
    );

    if (
      error.message === 'User ID is required' ||
      error.message === 'Month and year are required' ||
      error.message === 'Invalid user ID' ||
      error.message === 'Invalid month' ||
      error.message === 'Invalid year'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message === 'Employee not found'
    ) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Internal server error while fetching monthly attendance'
    });
  }
}


// ADMIN ATTENDANCE CORRECTION


async function addAttendanceCorrection(req, res) {
  try {

    const {
      user_id,
      punched_at,
      direction,
      reason
    } = req.body;


    // adminAuthorize middleware provides req.user
    const actorId =
      req.user.id;


    const result =
      await attendanceService.addAttendanceCorrection({
        actorId,
        userId: user_id,
        punchedAt: punched_at,
        direction,
        reason
      });


    return res
      .status(200)
      .json(result);

  } catch (error) {

    console.error(
      'Add attendance correction controller error:',
      error
    );

    if (
      error.message === 'MONTH_LOCKED'
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Attendance month is locked'
      });
    }

    if (
      error.message === 'Employee not found'
    ) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        'Failed to add attendance correction'
    });
  }
}

// ADMIN VOID ATTENDANCE CORRECTION


async function voidAttendanceCorrection(req, res) {
  try {

    const correctionId =
      req.params.id;

    const {
      reason
    } = req.body;

    // adminAuthorize middleware provides req.user
    const actorId =
      req.user.id;

    const result =
      await attendanceService.voidAttendanceCorrection({
        actorId,
        correctionId,
        reason
      });

    return res
      .status(200)
      .json(result);

  } catch (error) {

    console.error(
      'Void attendance correction controller error:',
      error
    );

    if (
      error.message === 'Correction ID is required' ||
      error.message === 'Invalid correction ID' ||
      error.message === 'Reason is required'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message === 'Correction not found'
    ) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message === 'Correction already voided'
    ) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message === 'MONTH_LOCKED'
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Attendance month is locked'
      });
    }

    if (
      error.message === 'Admin user not found'
    ) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Internal server error while voiding attendance correction'
    });
  }
}


// ADMIN - ADJUST ATTENDANCE LOP

async function adjustAttendanceLop(req, res) {
  try {
    const {
      user_id,
      work_date,
      new_lop,
      reason,
    } = req.body;

    const actorId = req.user.id;

    const result = await attendanceService.adjustAttendanceLop({
      actorId,
      userId: user_id,
      workDate: work_date,
      newLop: new_lop,
      reason,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error("Adjust attendance LOP error:", error);

    const statusCode =
      error.message === "Employee not found" ||
      error.message === "Attendance summary not found for this date" ||
      error.message === "Admin user not found"
        ? 404
        : error.message === "MONTH_LOCKED" ||
          error.message === "LOP adjustment is allowed only for ABSENT days" ||
          error.message === "New LOP is the same as the current LOP"
          ? 409
          : 400;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
      message: "Unable to adjust attendance LOP",
      data: null,
    });
  }
}

module.exports = {
  getMyAttendance,
  getMyAttendanceDay,
  getAdminDailyAttendance,
  getAdminMonthlyAttendance,
  addAttendanceCorrection,
  voidAttendanceCorrection,
  adjustAttendanceLop
};