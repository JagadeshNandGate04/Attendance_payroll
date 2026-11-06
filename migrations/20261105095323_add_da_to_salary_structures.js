
exports.up = function (knex) {
  return knex.schema.alterTable("salary_structures", (table) => {
    table.decimal("da", 10, 2).notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("salary_structures", (table) => {
    table.dropColumn("da");
  });
};
