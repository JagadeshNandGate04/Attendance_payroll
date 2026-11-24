const knex = require("../config/database");
const { validateDate } = require("../utils/attendanceUtils");
const { getLocalDateString } = require("../utils/attendanceStatus");

async function getEmployeeBirthdays({ month } = {}) {
  let selectedMonth = null;
  if (month !== undefined) {
    if (typeof month !== "string" || !/^(?:0?[1-9]|1[0-2])$/.test(month)) {
      const error = new Error("Month must be a number from 1 to 12");
      error.code = "INVALID_MONTH";
      throw error;
    }
    selectedMonth = Number(month);
  }

  const query = knex("users")
    .select(
      "id", "emp_code", "name",
      knex.raw("EXTRACT(MONTH FROM date_of_birth)::integer AS month"),
      knex.raw("EXTRACT(DAY FROM date_of_birth)::integer AS day")
    )
    .whereRaw("UPPER(role) = ?", ["EMPLOYEE"])
    .whereRaw("UPPER(status) = ?", ["ACTIVE"])
    .whereNotNull("date_of_birth");

  if (selectedMonth !== null) {
    query.whereRaw("EXTRACT(MONTH FROM date_of_birth) = ?", [selectedMonth]);
  }

  const birthdays = await query
    .orderBy("month")
    .orderBy("day")
    .orderBy("name")
    .orderBy("id");

  return {
    success: true,
    data: { month: selectedMonth, birthdays }
  };
}

async function processBirthdays(date = getLocalDateString()) {
  validateDate(date);
  const [year, month, day] = date.split("-").map(Number);
  const isNonLeapFeb28 = month === 2 && day === 28 &&
    new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1;

  return knex.transaction(async (trx) => {
    const birthdayEmployees = await trx("users")
      .select("id", "name", "emp_code")
      .whereRaw("UPPER(role) = ?", ["EMPLOYEE"])
      .whereRaw("UPPER(status) = ?", ["ACTIVE"])
      .whereNotNull("date_of_birth")
      .where("date_of_birth", "<=", date)
      .whereRaw("EXTRACT(MONTH FROM date_of_birth) = ?", [month])
      .where(function () {
        this.whereRaw("EXTRACT(DAY FROM date_of_birth) = ?", [day]);
        if (isNonLeapFeb28) this.orWhereRaw("EXTRACT(DAY FROM date_of_birth) = 29");
      })
      .orderBy("id");

    if (!birthdayEmployees.length) return { birthdays: 0, notifications_created: 0 };

    const recipients = await trx("users")
      .select("id")
      .whereRaw("UPPER(status) = ?", ["ACTIVE"])
      .whereRaw("UPPER(role) IN (?, ?)", ["EMPLOYEE", "ADMIN"])
      .orderBy("id");
    let created = 0;
    const batch = [];
    async function insertBatch() {
      if (!batch.length) return;
      const inserted = await trx("notifications")
        .insert(batch.splice(0, batch.length))
        .onConflict(trx.raw(
          "(user_id, entity_id, expires_on) WHERE type IN ('BIRTHDAY_WISH', 'EMPLOYEE_BIRTHDAY')"
        ))
        .ignore()
        .returning("id");
      created += inserted.length;
    }

    for (const employee of birthdayEmployees) {
      for (const recipient of recipients) {
        const isBirthdayEmployee = String(recipient.id) === String(employee.id);
        batch.push({
          user_id: recipient.id,
          actor_id: employee.id,
          type: isBirthdayEmployee ? "BIRTHDAY_WISH" : "EMPLOYEE_BIRTHDAY",
          title: isBirthdayEmployee ? "Happy Birthday!" : "Employee Birthday Today",
          message: isBirthdayEmployee
            ? `Happy Birthday, ${employee.name}! Wishing you a wonderful day.`
            : `Today is ${employee.name}'s birthday. Wish them a happy birthday!`,
          entity_type: "employee",
          entity_id: employee.id,
          expires_on: date,
          data: {
            employee_id: employee.id,
            employee_name: employee.name,
            emp_code: employee.emp_code,
            birthday_date: date,
            expires_on: date
          }
        });
        if (batch.length === 500) await insertBatch();
      }
    }
    await insertBatch();
    return { birthdays: birthdayEmployees.length, notifications_created: created };
  });
}

module.exports = { processBirthdays, getEmployeeBirthdays };
