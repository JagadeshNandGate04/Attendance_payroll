exports.up = async function (knex) {
  await knex.schema.alterTable("users", (table) => {
    table.date("date_of_birth").nullable();
  });

  await knex.raw(`
    UPDATE users AS u
    SET date_of_birth = p.date_of_birth
    FROM employee_profiles AS p
    WHERE p.user_id = u.id
  `);

  await knex.raw(`
    CREATE FUNCTION sync_user_date_of_birth() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        UPDATE users SET date_of_birth = NULL WHERE id = OLD.user_id;
        RETURN OLD;
      END IF;
      UPDATE users SET date_of_birth = NEW.date_of_birth WHERE id = NEW.user_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.raw(`
    CREATE TRIGGER sync_user_date_of_birth_trigger
    AFTER INSERT OR UPDATE OF date_of_birth OR DELETE ON employee_profiles
    FOR EACH ROW EXECUTE FUNCTION sync_user_date_of_birth()
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX birthday_notification_once_per_recipient
    ON notifications (user_id, entity_id, expires_on)
    WHERE type IN ('BIRTHDAY_WISH', 'EMPLOYEE_BIRTHDAY')
  `);
};

exports.down = async function (knex) {
  await knex.raw("DROP INDEX birthday_notification_once_per_recipient");
  await knex.raw("DROP TRIGGER sync_user_date_of_birth_trigger ON employee_profiles");
  await knex.raw("DROP FUNCTION sync_user_date_of_birth()");
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("date_of_birth");
  });
};
