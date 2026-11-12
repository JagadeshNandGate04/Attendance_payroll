
exports.up = async function (knex) {

  // =====================================================
  // EMPLOYEE IDENTITY DETAILS
  // =====================================================

  await knex.schema.createTable(
    "employee_identity_details",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .unique()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.text("aadhaar_number_encrypted").nullable();
      table.text("pan_number_encrypted").nullable();
      table.text("voter_id_number_encrypted").nullable();
      table.text("driving_license_number_encrypted").nullable();

      table.timestamps(true, true);
    }
  );

  // =====================================================
  // EMPLOYEE STATUTORY DETAILS
  // =====================================================

  await knex.schema.createTable(
    "employee_statutory_details",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .unique()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.boolean("is_pf_eligible").notNullable().defaultTo(false);

      table.text("pf_account_no_encrypted").nullable();

      table.text("uan_no_encrypted").nullable();

      table.boolean("is_esi_eligible").notNullable().defaultTo(false);

      table.text("esi_no_encrypted").nullable();

      table.timestamps(true, true);
    }
  );

  // =====================================================
  // EMPLOYEE BANK DETAILS
  // =====================================================

  await knex.schema.createTable("employee_bank_details", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.string("bank_name", 150).nullable();

    table.string("branch_name", 150).nullable();

    table.text("account_number_encrypted").nullable();

    table.string("ifsc_code", 20).nullable();

    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("employee_bank_details");
  await knex.schema.dropTableIfExists("employee_statutory_details");
  await knex.schema.dropTableIfExists("employee_identity_details");
};
