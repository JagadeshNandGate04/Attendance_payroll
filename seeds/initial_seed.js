exports.up = async function (knex) {
  await knex.schema.createTable("password_setup_tokens", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .text("token_hash")
      .notNullable()
      .unique();

    table
      .timestamp("expires_at", {
        useTz: true
      })
      .notNullable();

    table
      .timestamp("used_at", {
        useTz: true
      })
      .nullable();

    table
      .timestamp("created_at", {
        useTz: true
      })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", {
        useTz: true
      })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["user_id"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(
    "password_setup_tokens"
  );
};