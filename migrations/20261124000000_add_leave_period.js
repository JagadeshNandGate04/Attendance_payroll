exports.up = async function (knex) {
  await knex.schema.alterTable("leave_requests", (table) => {
    table.string("leave_period", 10).notNullable().defaultTo("FULL_DAY");
  });

  await knex.raw(`
    ALTER TABLE leave_requests
    ADD CONSTRAINT leave_requests_leave_period_check
    CHECK (
      leave_period = 'FULL_DAY' OR
      (leave_period IN ('MORNING', 'AFTERNOON') AND from_date = to_date AND days = 0.5)
    )
  `);
};

exports.down = async function (knex) {
  const halfDay = await knex("leave_requests")
    .whereIn("leave_period", ["MORNING", "AFTERNOON"])
    .first("id");
  if (halfDay) {
    throw new Error("Cannot remove leave period while half-day requests exist");
  }
  await knex.raw("ALTER TABLE leave_requests DROP CONSTRAINT leave_requests_leave_period_check");
  await knex.schema.alterTable("leave_requests", (table) => {
    table.dropColumn("leave_period");
  });
};
