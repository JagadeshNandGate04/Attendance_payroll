const db = require("../config/database");

/**
 * Remove sensitive fields recursively from audit JSON.
 * This applies to nested objects and arrays as well.
 */
function sanitizeAuditData(value) {
  const sensitiveKeys = [
    "password",
    "password_hash",
    "fcm_tokens",
    "access_token",
    "refresh_token",
    "token",
    "authorization",
    "secret",
    "client_secret",
    "api_key",
    "private_key",
    "session",
  ];

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditData(item));
  }

  if (value !== null && typeof value === "object") {
    const sanitized = {};

    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        continue;
      }

      sanitized[key] = sanitizeAuditData(item);
    }

    return sanitized;
  }

  return value;
}

/**
 * Apply filters to the audit log query.
 */
function applyFilters(query, filters) {
  const {
    action,
    entity_type,
    actor_id,
    from_date,
    to_date,
  } = filters;

  if (action) {
    query.where("al.action", action);
  }

  if (entity_type) {
    query.where("al.entity_type", entity_type);
  }

  if (actor_id) {
    query.where("al.actor_id", actor_id);
  }

  if (from_date) {
    query.where("al.created_at", ">=", from_date);
  }

  if (to_date) {
    // Include the entire selected end date.
    query.whereRaw("al.created_at < (?::date + INTERVAL '1 day')", [
      to_date,
    ]);
  }

  return query;
}

/**
 * GET /audit-logs
 * List audit logs with pagination and filters.
 */
async function getAuditLogs(filters = {}) {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(filters.limit, 10) || 10, 1),
    100
  );

  const offset = (page - 1) * limit;

  const baseQuery = db("audit_log as al")
    .leftJoin("users as u", "u.id", "al.actor_id");

  applyFilters(baseQuery, filters);

  // Get total matching records before pagination.
  const countResult = await baseQuery
    .clone()
    .count({ total: "al.id" })
    .first();

  const total = Number(countResult?.total || 0);

  // Fetch the actual audit logs.
  const logs = await baseQuery
    .clone()
    .select(
      "al.id",
      "al.actor_id",
      "u.name as actor_name",
      "u.emp_code as actor_emp_code",
      "al.action",
      "al.entity_type",
      "al.entity_id",
      "al.before",
      "al.after",
      "al.reason",
      "al.created_at",
      "al.updated_at"
    )
    .orderBy("al.created_at", "desc")
    .orderBy("al.id", "desc")
    .limit(limit)
    .offset(offset);

  // Sanitize JSON before returning it to the controller.
  const sanitizedLogs = logs.map((log) => ({
    ...log,
    before: sanitizeAuditData(log.before),
    after: sanitizeAuditData(log.after),
  }));

  return {
    logs: sanitizedLogs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      count: sanitizedLogs.length,
    },
  };
}

/**
 * GET /audit-logs/:id
 * Get a single audit log.
 */
async function getAuditLogById(id) {
  const log = await db("audit_log as al")
    .leftJoin("users as u", "u.id", "al.actor_id")
    .select(
      "al.id",
      "al.actor_id",
      "u.name as actor_name",
      "u.emp_code as actor_emp_code",
      "al.action",
      "al.entity_type",
      "al.entity_id",
      "al.before",
      "al.after",
      "al.reason",
      "al.created_at",
      "al.updated_at"
    )
    .where("al.id", id)
    .first();

  if (!log) {
    return null;
  }

  // Apply the same security filtering to the detail endpoint.
  return {
    ...log,
    before: sanitizeAuditData(log.before),
    after: sanitizeAuditData(log.after),
  };
}

module.exports = {
  getAuditLogs,
  getAuditLogById,
};