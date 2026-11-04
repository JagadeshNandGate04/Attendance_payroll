
exports.up = function (knex) {
  return knex.schema.createTable('notifications', function (table) {
    table.bigIncrements('id').primary();

    // Notification recipient
    table.bigInteger('user_id')
      .references('id')
      .inTable('users')
      .notNullable()
      .onDelete('CASCADE');

    // User who triggered the notification
    table.bigInteger('actor_id')
      .references('id')
      .inTable('users')
      .nullable()
      .onDelete('SET NULL');

    table.string('type', 40).notNullable();

    table.string('title', 150).notNullable();

    table.text('message').notNullable();

    // Related request or record
    table.string('entity_type', 40);
    table.bigInteger('entity_id');

    // Additional notification details
    table.jsonb('data').notNullable().defaultTo('{}');

    // Read/unread tracking
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('read_at', { useTz: true });

    table.timestamps(true, true);

    // Query optimization
    table.index(['user_id', 'is_read', 'created_at']);
    table.index(['entity_type', 'entity_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('notifications');
};
