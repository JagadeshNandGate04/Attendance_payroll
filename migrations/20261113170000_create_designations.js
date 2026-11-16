exports.up = async function (knex) {
  await knex.schema.createTable("designations", (table) => {
    table.bigIncrements("id").primary();
    table.string("name", 80).notNullable().unique();
    table.timestamps(true, true);
  });

  await knex.raw(
    "CREATE UNIQUE INDEX designations_name_lower_unique ON designations (LOWER(name))",
  );

  const existingDesignations = await knex("users")
    .distinct("designation")
    .whereNotNull("designation")
    .whereRaw("BTRIM(designation) <> ''");

  const designationsByName = new Map();
  for (const { designation } of existingDesignations) {
    const name = designation.trim();
    designationsByName.set(name.toLowerCase(), name);
  }

  if (designationsByName.size > 0) {
    await knex("designations").insert(
      Array.from(designationsByName.values(), (name) => ({ name })),
    );
  }
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("designations");
};
