exports.up = async function (knex) {
  await knex.schema.createTable(
    "notification_push_jobs",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("notification_id")
        .notNullable()
        .unique()
        .references("id")
        .inTable("notifications")
        .onDelete("CASCADE");

      table
        .bigInteger("user_id")
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table
        .string("status", 20)
        .notNullable()
        .defaultTo("PENDING");

      table.integer("attempts").notNullable().defaultTo(0);

      table.timestamp("next_attempt_at", {
        useTz: true,
      }).notNullable().defaultTo(knex.fn.now());

      table.text("last_error").nullable();

      table.timestamp("sent_at", {
        useTz: true,
      }).nullable();

      table.timestamp("created_at", {
        useTz: true,
      }).notNullable().defaultTo(knex.fn.now());

      table.timestamp("updated_at", {
        useTz: true,
      }).notNullable().defaultTo(knex.fn.now());

      table.index(
        ["status", "next_attempt_at"],
        "idx_push_jobs_status_next_attempt"
      );
    }
  );

  // Automatically create a push job whenever an in-app
  // notification is inserted.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_notification_push_job()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO notification_push_jobs (
        notification_id,
        user_id
      )
      VALUES (
        NEW.id,
        NEW.user_id
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_create_notification_push_job
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION create_notification_push_job();
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP TRIGGER IF EXISTS
    trg_create_notification_push_job
    ON notifications;
  `);

  await knex.raw(`
    DROP FUNCTION IF EXISTS
    create_notification_push_job();
  `);

  await knex.schema.dropTableIfExists(
    "notification_push_jobs"
  );
};