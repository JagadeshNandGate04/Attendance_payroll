exports.up = async function (knex) {
  await knex.schema.createTable("workday_swap_groups", (table) => {
    table.bigIncrements("id").primary();
    table.date("shutdown_date").notNullable();
    table.date("replacement_date").notNullable();
    table.text("reason").notNullable();
    table.bigInteger("created_by").notNullable().references("id").inTable("users");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("shutdown_date <> replacement_date");
    table.index(["shutdown_date"], "idx_workday_swap_groups_shutdown_date");
    table.index(["replacement_date"], "idx_workday_swap_groups_replacement_date");
  });

  await knex.schema.createTable("workday_swap_employees", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("group_id")
      .notNullable()
      .references("id")
      .inTable("workday_swap_groups")
      .onDelete("CASCADE");
    table.bigInteger("user_id").notNullable().references("id").inTable("users");
    table.unique(["group_id", "user_id"]);
    table.index(["user_id", "group_id"], "idx_workday_swap_employees_user_group");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("workday_swap_employees");
  await knex.schema.dropTableIfExists("workday_swap_groups");
};
