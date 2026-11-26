async function notifyAdmins(trx, {
  actorId,
  type,
  title,
  message,
  entityType,
  entityId,
  data = {}
}) {
  const admins = await trx("users")
    .select("id")
    .whereRaw("UPPER(role) = ?", ["ADMIN"])
    .whereRaw("UPPER(status) = ?", ["ACTIVE"]);

  if (!admins.length) return;

  await trx("notifications").insert(
    admins.map((admin) => ({
      user_id: admin.id,
      actor_id: actorId,
      type,
      title,
      message,
      entity_type: entityType,
      entity_id: entityId,
      data
    }))
  );
}

module.exports = { notifyAdmins };
