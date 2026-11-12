exports.up = async function (knex) {
  // Step 1: Create employee_profiles table
  await knex.schema.createTable("employee_profiles", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // Profile picture
    table.string("profile_picture_path", 500).nullable();
    table.string("profile_picture_mime_type", 100).nullable();
    table.bigInteger("profile_picture_size_bytes").nullable();

    // Personal information
    table.string("marital_status", 50).nullable();
    table.string("father_spouse_name", 150).nullable();
    table.string("religion", 100).nullable();
    table.string("caste", 100).nullable();
    table.string("mother_tongue", 100).nullable();
    table.string("cug_mobile_no", 20).nullable();
    table.string("city_of_birth", 100).nullable();
    table.string("country_of_birth", 100).nullable();
    table.string("nationality", 100).nullable();
    table.string("community", 100).nullable();
    table.string("official_email", 255).nullable();
    table.smallint("retirement_age").nullable();
    table.string("highest_qualification_level", 150).nullable();
    table.string("blood_group", 10).nullable();
    table.decimal("height_cm", 6, 2).nullable();
    table.decimal("weight_kg", 6, 2).nullable();
    table.date("date_of_birth").nullable();

    // Contact information
    table.string("secondary_mobile_no", 20).nullable();
    table.string("contact_email", 255).nullable();

    table.timestamps(true, true);
    table.index(["user_id"]);
  });

  // Step 2: Create an empty profile for every existing employee
  await knex.raw(`
    INSERT INTO employee_profiles (
      user_id,
      created_at,
      updated_at
    )
    SELECT
      id,
      NOW(),
      NOW()
    FROM users
    WHERE role = 'EMPLOYEE'
    ON CONFLICT (user_id) DO NOTHING
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("employee_profiles");
};