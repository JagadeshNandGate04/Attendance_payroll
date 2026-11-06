
const payrollService = require('../services/PayrollService');

// CREATE PAYROLL RUN


async function createPayrollRun(req, res) {
  try {
    const { month, year } = req.body;
    const adminId = req.user.id;

    const result = await payrollService.createPayrollRun({
      adminId,
      month,
      year,
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error('Create payroll run error:', error);

    if (error.code === 'INVALID_MONTH') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'INVALID_YEAR') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'DUPLICATE') {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          payroll_run: error.payrollRun,
        },
      });
    }

    if (error.code === 'SALARY_STRUCTURE_NOT_FOUND') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          user_id: error.userId,
        },
      });
    }

    if (error.code === 'MONTH_LOCKED') {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
        data: {
          locked_date: error.lockedDate,
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating payroll run',
    });
  }
}


// GET PAYROLL RUNS


async function getPayrollRuns(req, res) {
  try {
    const { year } = req.query;

    const result = await payrollService.getPayrollRuns({ year });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Get payroll runs error:', error);

    if (error.code === 'INVALID_YEAR') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payroll runs',
    });
  }
}


// GET PAYROLL RUN DETAILS


async function getPayrollRunById(req, res) {
  try {
    const { id } = req.params;

    const result = await payrollService.getPayrollRunById({
      payrollRunId: id,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Get payroll run details error:', error);

    if (error.code === 'INVALID_ID') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payroll run',
    });
  }
}


// UPDATE PAYROLL ITEM


async function updatePayrollItem(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const {
      other_earnings,
      other_deductions,
      remarks,
    } = req.body;

    const result = await payrollService.updatePayrollItem({
      payrollItemId: id,
      adminId,
      otherEarnings: other_earnings,
      otherDeductions: other_deductions,
      remarks,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Update payroll item error:', error);

    if (error.code === 'INVALID_ID') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'INVALID_STATE') {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating payroll item',
    });
  }
}


// RECOMPUTE PAYROLL RUN


async function recomputePayrollRun(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await payrollService.recomputePayrollRun({
      payrollRunId: id,
      adminId,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Recompute payroll error:', error);

    if (
      error.code === 'INVALID_ID' ||
      error.code === 'INVALID_STATE'
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while recomputing payroll',
    });
  }
}


// FINALIZE PAYROLL RUN


async function finalizePayrollRun(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;

    const result = await payrollService.finalizePayrollRun({
      payrollRunId: id,
      adminId,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Finalize payroll error:', error);

    if (
      error.code === 'INVALID_ID' ||
      error.code === 'INVALID_STATE'
    ) {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while finalizing payroll',
    });
  }
}


// EXPORT PAYROLL RUN


async function exportPayrollRun(req, res) {
  try {
    const { id } = req.params;

    const result = await payrollService.exportPayrollRun({
      payrollRunId: id,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`
    );

    await result.workbook.xlsx.write(res);

    res.end();

  } catch (error) {
    console.error('Export payroll error:', error);

    if (error.code === 'INVALID_ID') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while exporting payroll',
    });
  }
}

// GET MY PAYSLIPS


async function getMyPayslips(req, res) {
  try {
    const userId = req.user.id;

    const result = await payrollService.getMyPayslips({
      userId,
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Get payslips error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching payslips',
    });
  }
}

// DOWNLOAD MY PAYSLIP


async function downloadMyPayslip(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await payrollService.downloadMyPayslip({
      payslipId: id,
      userId,
    });

    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${result.fileName}"`
    );

    return res.sendFile(result.filePath);

  } catch (error) {
    console.error('Download payslip error:', error);

    if (error.code === 'INVALID_ID') {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    if (
      error.code === 'NOT_FOUND' ||
      error.code === 'FORBIDDEN'
    ) {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error while downloading payslip',
    });
  }
}

// EXPORTS

module.exports = {
  createPayrollRun,
  getPayrollRuns,
  getPayrollRunById,
  updatePayrollItem,
  recomputePayrollRun,
  finalizePayrollRun,
  exportPayrollRun,
  getMyPayslips,
  downloadMyPayslip,
};
