exports.up = function (knex) {
  return knex.schema.alterTable("notifications", (table) => {
    table.date("expires_on").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("notifications", (table) => {
    table.dropColumn("expires_on");
  });
};
