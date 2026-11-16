exports.up = async function (knex) {
  await knex.schema.alterTable("holidays", (table) => {
    table.boolean("is_all_employees").notNullable().defaultTo(true);
  });

  await knex.schema.createTable("holiday_employees", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("holiday_id")
      .notNullable()
      .references("id")
      .inTable("holidays")
      .onDelete("CASCADE");
    table.bigInteger("user_id")
      .notNullable()
      .references("id")
      .inTable("users");
    table.unique(["holiday_id", "user_id"]);
    table.index(["user_id", "holiday_id"], "idx_holiday_employees_user_holiday");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("holiday_employees");
  await knex.schema.alterTable("holidays", (table) => {
    table.dropColumn("is_all_employees");
  });
};
