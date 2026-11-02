const knex =
  require('../config/database');

const bcrypt =
  require('bcryptjs');


async function createEmployee(data) {

  const {
    name,
    email,
    phone,
    password,
    date_of_joining,
    designation
  } = data;

  const existingEmail =
    await knex('users')
      .where({ email })
      .first();

  if (existingEmail) {

    return {

      success: false,
      statusCode: 409,
      message:
        'Email already exists'

    };

  }

  const existingPhone =
    await knex('users')
      .where({ phone })
      .first();

  if (existingPhone) {

    return {

      success: false,
      statusCode: 409,
      message:
        'Phone number already exists'

    };

  }

  const lastEmployee =
    await knex('users')
      .where({
        role: 'EMPLOYEE'
      })
      .orderBy('id', 'desc')
      .first();


  let nextNumber = 1;


  if (
    lastEmployee &&
    lastEmployee.emp_code
  ) {

    const match =
      lastEmployee.emp_code.match(
        /EMP(\d+)/
      );

    if (match) {

      nextNumber =
        parseInt(
          match[1],
          10
        ) + 1;

    }

  }


  const empCode =
    `EMP${String(nextNumber).padStart(3, '0')}`;


  const passwordHash =
    await bcrypt.hash(
      password,
      10
    );

  const [employee] =
    await knex('users')
      .insert({

        emp_code:
          empCode,

        name,

        email,

        phone,

        password_hash:
          passwordHash,

        role:
          'EMPLOYEE',

        date_of_joining,

        designation,

        status:
          'ACTIVE'

      })
      .returning([

        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status'

      ]);


  return {

    success: true,

    statusCode: 201,

    message:
      'Employee created successfully',

    data:
      employee

  };

}

async function getAllEmployees() {
  const employees = await knex("users as u")
    .leftJoin("salary_structures as ss", function () {
      this.on("u.id", "=", "ss.user_id")
        .andOnNull("ss.effective_to");
    })
    .select(
      // Employee details
      "u.id",
      "u.emp_code",
      "u.name",
      "u.email",
      "u.phone",
      "u.designation",
      "u.date_of_joining",
      "u.status",

      // Current salary details
      "ss.id as salary_structure_id",
      "ss.basic",
      "ss.hra",
      "ss.special_allowance",
      "ss.gross",
      "ss.effective_from"
    )
    .where("u.role", "EMPLOYEE")
    .andWhere("u.status", "ACTIVE")
    .orderBy("u.name", "asc");

  return employees;
}


// FETCH EMPLOYEE BY ID

async function getEmployeeById(id) {
  const employee = await knex('users')
    .select(
      'id',
      'emp_code',
      'name',
      'email',
      'phone',
      'role',
      'date_of_joining',
      'designation',
      'status',
      'created_at',
      'updated_at'
    )
    .where({ id })
    .first();

  if (!employee) {
    return {
      success: false,
      statusCode: 404,
      message: 'Employee not found',
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: 'Employee fetched successfully',
    data: employee,
  };
}

module.exports = {
  createEmployee,
  getAllEmployees,
  getEmployeeById
};