
exports.up = async function (knex) {
  await knex.schema.alterTable("workday_swap_groups", (table) => {
    table.renameColumn("shutdown_date", "holiday_date");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("workday_swap_groups", (table) => {
    table.renameColumn("holiday_date", "shutdown_date");
  });
};
