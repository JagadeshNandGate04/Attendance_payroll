
exports.up = async function (knex) {

  // =====================================================
  // EMPLOYEE PROFILE CHANGE REQUESTS
  // =====================================================

  await knex.schema.createTable(
    "employee_profile_change_requests",
    (table) => {
      table.bigIncrements("id").primary();

      table
        .bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      // PERSONAL / ADDRESS / FAMILY / EMERGENCY_CONTACT /
      // QUALIFICATION / IDENTITY / STATUTORY / BANK /
      // EXPERIENCE / DOCUMENT

      table.string("section", 50).notNullable();

      // Existing record ID for UPDATE or DELETE.
      // NULL for a new CREATE request.
      // This is polymorphic, so it intentionally has no FK.
      table.bigInteger("record_id").nullable();

      // CREATE / UPDATE / DELETE
      table.string("request_type", 20).notNullable();

      // Snapshot of existing approved data at submission.
      table.jsonb("existing_data").notNullable().defaultTo("{}");

      // Employee's proposed changes.
      table.jsonb("requested_data").notNullable().defaultTo("{}");

      // PENDING / APPROVED / REJECTED
      table.string("status", 20).notNullable().defaultTo("PENDING");

      table
        .bigInteger("reviewed_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");

      table.timestamp("reviewed_at", { useTz: true }).nullable();

      table.text("approval_remarks").nullable();

      table.timestamps(true, true);

      table.index(["user_id"]);
      table.index(["status"]);
      table.index(["section"]);
      table.index(["reviewed_by"]);
      table.index(["user_id", "status"]);
      table.index(["created_at"]);
    }
  );

  // =====================================================
  // EMPLOYEE DOCUMENTS
  // =====================================================

  await knex.schema.createTable("employee_documents", (table) => {
    table.bigIncrements("id").primary();

    table
      .bigInteger("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .bigInteger("change_request_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("employee_profile_change_requests")
      .onDelete("SET NULL");

    // Examples: AADHAAR, PAN, PASSPORT, RESUME,
    // EDUCATION_CERTIFICATE, EXPERIENCE_LETTER, OTHER
    table.string("document_type", 60).notNullable();

    table.string("document_name", 200).notNullable();

    // Store a private storage path, never a public URL.
    table.string("file_path", 500).notNullable();

    table.string("original_file_name", 255).notNullable();

    table.string("mime_type", 100).notNullable();

    table.bigInteger("file_size_bytes").notNullable();

    table.string("file_extension", 15).nullable();

    table.text("description").nullable();

    // PENDING / APPROVED / REJECTED
    table.string("status", 20).notNullable().defaultTo("PENDING");

    table
      .bigInteger("reviewed_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.timestamp("reviewed_at", { useTz: true }).nullable();

    table.text("approval_remarks").nullable();

    table.timestamps(true, true);

    table.index(["user_id"]);
    table.index(["user_id", "status"]);
    table.index(["document_type"]);
    table.index(["change_request_id"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("employee_documents");

  await knex.schema.dropTableIfExists(
    "employee_profile_change_requests"
  );
};
