
exports.up = async function (knex) {
  await knex.schema.createTable(
    "attendance_lop_adjustments",
    function (table) {
      table.increments("id").primary();

      table.integer("user_id").notNullable();

      table.date("work_date").notNullable();

      // LOP before the admin adjustment
      table.decimal("previous_lop", 5, 2).notNullable();

      // LOP after the admin adjustment
      table.decimal("new_lop", 5, 2).notNullable();

      table.text("reason").notNullable();

      // Admin who made the adjustment
      table.integer("created_by").notNullable();

      table.timestamp("created_at", {
        useTz: true,
      }).notNullable().defaultTo(knex.fn.now());

      // Index for retrieving an employee's LOP adjustments
      table.index(
        ["user_id", "work_date"],
        "idx_lop_adjustments_user_date"
      );

      // Index for retrieving adjustment history
      table.index(
        ["created_by"],
        "idx_lop_adjustments_created_by"
      );
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(
    "attendance_lop_adjustments"
  );
};
