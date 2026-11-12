
exports.up = async function (knex) {

  // =====================================================
  // EMPLOYEE ADDRESSES
  // =====================================================

  await knex.schema.createTable("employee_addresses", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // PERMANENT / COMMUNICATION
    table.string("address_type", 30).notNullable();

    table.string("address_line_1", 255).nullable();
    table.string("address_line_2", 255).nullable();
    table.string("address_line_3", 255).nullable();

    table.string("city", 100).nullable();
    table.string("district", 100).nullable();
    table.string("state", 100).nullable();
    table.string("pincode", 15).nullable();
    table.string("country", 100).nullable();

    table.timestamps(true, true);

    table.unique(["user_id", "address_type"]);
    table.index(["user_id"]);
  });

  // =====================================================
  // EMPLOYEE EMERGENCY CONTACTS
  // =====================================================

  await knex.schema.createTable(
    "employee_emergency_contacts",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.string("contact_name", 150).notNullable();
      table.string("relation", 100).nullable();

      table.string("mobile_no", 20).notNullable();
      table.string("alternate_mobile_no", 20).nullable();

      table.text("address").nullable();

      table.boolean("is_primary").notNullable().defaultTo(false);
      table.string("status", 20).notNullable().defaultTo("ACTIVE");

      table.timestamps(true, true);

      table.index(["user_id"]);
      table.index(["user_id", "status"]);
    }
  );

  // =====================================================
  // EMPLOYEE FAMILY MEMBERS
  // =====================================================

  await knex.schema.createTable("employee_family_members", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.string("name", 150).notNullable();

    table.string("relation", 100).notNullable();

    table.string("gender", 20).nullable();

    table.date("date_of_birth").nullable();

    table.string("profession", 150).nullable();

    // FAMILY_MEMBER / DEPENDENT
    table.string("family_member_type", 30).notNullable();

    table.text("address").nullable();

    // ACTIVE / INACTIVE
    table.string("status", 20).notNullable().defaultTo("ACTIVE");

    table.text("remarks").nullable();

    table.timestamps(true, true);

    table.index(["user_id"]);
    table.index(["user_id", "status"]);
    table.index(["relation"]);
  });

  // =====================================================
  // EMPLOYEE QUALIFICATIONS
  // =====================================================

  await knex.schema.createTable(
    "employee_qualifications",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      // ACADEMIC / TECHNICAL
      table.string("qualification_type", 30).notNullable();

      table.string("qualification", 200).notNullable();

      table.string("institute_name", 255).nullable();

      table.string("specialization", 200).nullable();

      table.smallint("from_year").nullable();

      table.smallint("to_year").nullable();

      table.string("status", 20).notNullable().defaultTo("ACTIVE");

      table.text("remarks").nullable();

      table.timestamps(true, true);

      table.index(["user_id"]);
      table.index(["user_id", "qualification_type"]);
    }
  );

  // =====================================================
  // EMPLOYEE WORK EXPERIENCES
  // =====================================================

  await knex.schema.createTable(
    "employee_work_experiences",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.string("previous_org_name", 255).notNullable();

      table.string("designation", 150).nullable();

      table.date("from_date").nullable();

      table.date("to_date").nullable();

      table.string("status", 20).notNullable().defaultTo("ACTIVE");

      table.text("remarks").nullable();

      table.timestamps(true, true);

      table.index(["user_id"]);
    }
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("employee_work_experiences");
  await knex.schema.dropTableIfExists("employee_qualifications");
  await knex.schema.dropTableIfExists("employee_family_members");
  await knex.schema.dropTableIfExists("employee_emergency_contacts");
  await knex.schema.dropTableIfExists("employee_addresses");
};
