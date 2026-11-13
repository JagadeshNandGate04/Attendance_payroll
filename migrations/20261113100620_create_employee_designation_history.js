
exports.up = function (knex) {
  return knex.schema.createTable(
    "employee_designation_history",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("RESTRICT");

      table.string("old_designation", 150).nullable();
      table.string("new_designation", 150).notNullable();

      table.date("effective_date").notNullable();

      table
        .bigInteger("changed_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("RESTRICT");

      table.text("remarks").nullable();

      table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

      table.index(["user_id", "effective_date"]);
      table.index(["changed_by"]);
    }
  );
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists(
    "employee_designation_history"
  );
};
