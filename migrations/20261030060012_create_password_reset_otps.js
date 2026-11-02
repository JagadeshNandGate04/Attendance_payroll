exports.up = function (knex) {
  return knex.schema.createTable('password_reset_otps', function (table) {
    table.bigIncrements('id').primary();

    // Must match users.id BIGINT
    table.bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('otp_hash', 64).notNullable();

    table.timestamp('expires_at', { useTz: true }).notNullable();

    table.integer('attempts').notNullable().defaultTo(0);

    table.timestamp('verified_at', { useTz: true });

    table.string('reset_token_hash', 64);

    table.timestamp('reset_token_expires_at', { useTz: true });

    table.timestamp('used_at', { useTz: true });

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id'], 'idx_password_reset_otps_user_id');
    table.index(['expires_at'], 'idx_password_reset_otps_expires_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('password_reset_otps');
};