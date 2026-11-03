const auditLogService = require("../services/auditLogService");

// GET AUDIT LOGS

async function getAuditLogs(req, res) {
  try {
    const {
      action,
      entity_type,
      actor_id,
      from_date,
      to_date,
      page,
      limit,
    } = req.query;

    // Validate actor_id when supplied.
    if (
      actor_id &&
      (!/^\d+$/.test(actor_id) || Number(actor_id) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid actor_id",
      });
    }

    // Validate date format when supplied.
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (from_date && !dateRegex.test(from_date)) {
      return res.status(400).json({
        success: false,
        message: "from_date must be in YYYY-MM-DD format",
      });
    }

    if (to_date && !dateRegex.test(to_date)) {
      return res.status(400).json({
        success: false,
        message: "to_date must be in YYYY-MM-DD format",
      });
    }

    if (from_date && to_date && from_date > to_date) {
      return res.status(400).json({
        success: false,
        message: "from_date cannot be after to_date",
      });
    }

    const result = await auditLogService.getAuditLogs({
      action,
      entity_type,
      actor_id,
      from_date,
      to_date,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      message: "Audit logs fetched successfully",
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get audit logs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit logs",
    });
  }
}



// FETCH AUDIT LOG BY ID

async function getAuditLogById(req, res) {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid audit log ID",
      });
    }

    const log = await auditLogService.getAuditLogById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Audit log fetched successfully",
      data: log,
    });
  } catch (error) {
    console.error("Get audit log details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit log details",
    });
  }
}

module.exports = {
  getAuditLogs,
  getAuditLogById,
};