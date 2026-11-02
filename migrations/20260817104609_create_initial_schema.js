exports.up = function(knex) {
  return knex.schema
    // 1. Users table (no foreign keys)
    .createTable('users', function(table) {
      table.bigIncrements('id').primary();
      table.string('emp_code', 20).notNullable().unique();
      table.string('name', 100).notNullable();
      table.string('email', 150).notNullable().unique();
      table.string('phone', 15);
      //table.string('password_hash', 255).notNullable();
      table.string('password_hash', 255);
      table.string('role', 10).notNullable();
      table.date('date_of_joining').notNullable();
      table.string('designation', 80);
      table.string('status', 10).notNullable().defaultTo('ACTIVE');
      table.jsonb('fcm_tokens').defaultTo('[]');
      table.timestamps(true, true);
    })

    // 2. Devices table (no foreign keys)
    .createTable('devices', function(table) {
      table.bigIncrements('id').primary();
      table.string('serial_number', 50).notNullable().unique();
      table.string('name', 50);
      table.timestamp('last_seen_at', { useTz: true });
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })

    // 3. Raw punches (references devices)
    .createTable('raw_punches', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('device_id').references('id').inTable('devices');
      table.string('emp_code', 20).notNullable();
      table.timestamp('punched_at', { useTz: true }).notNullable();
      table.string('direction', 3).notNullable();
      table.string('verify_mode', 20);
      table.text('raw_payload');
      table.timestamps(true, true);
      table.unique(['device_id', 'emp_code', 'punched_at']);
      table.index(['emp_code', 'punched_at']);
    })

    // 4. Regularization requests (references users) - MOVED BEFORE correction_punches
    .createTable('regularization_requests', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.date('work_date').notNullable();
      table.string('type', 12).notNullable();
      table.timestamp('claimed_in', { useTz: true });
      table.timestamp('claimed_out', { useTz: true });
      table.text('reason').notNullable();
      table.string('status', 10).notNullable().defaultTo('PENDING');
      table.bigInteger('decided_by').references('id').inTable('users');
      table.timestamp('decided_at', { useTz: true });
      table.text('decision_note');
      table.timestamps(true, true);
    })

    // 5. Correction punches (references users and regularization_requests)
    .createTable('correction_punches', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.timestamp('punched_at', { useTz: true }).notNullable();
      table.string('direction', 3).notNullable();
      table.string('source', 20).notNullable();
      table.bigInteger('regularization_id').references('id').inTable('regularization_requests');
      table.bigInteger('created_by').references('id').inTable('users').notNullable();
      table.text('reason').notNullable();
      table.boolean('is_voided').defaultTo(false);
      table.timestamps(true, true);
    })

    // 6. Leave requests (references users) - MOVED BEFORE leave_ledger
    .createTable('leave_requests', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.date('from_date').notNullable();
      table.date('to_date').notNullable();
      table.decimal('days', 3, 1).notNullable();
      table.text('reason').notNullable();
      table.boolean('is_retroactive').notNullable();
      table.string('status', 10).notNullable().defaultTo('PENDING');
      table.bigInteger('decided_by').references('id').inTable('users');
      table.timestamp('decided_at', { useTz: true });
      table.text('decision_note');
      table.timestamps(true, true);
    })

    // 7. Leave ledger (references users and leave_requests)
    .createTable('leave_ledger', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.date('entry_date').notNullable();
      table.decimal('delta', 3, 1).notNullable();
      table.string('type', 15).notNullable();
      table.bigInteger('leave_request_id').references('id').inTable('leave_requests');
      table.text('note');
      table.timestamps(true, true);
    })

    // 8. Attendance sessions (references users)
    .createTable('attendance_sessions', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users');
      table.date('work_date').notNullable();
      table.timestamp('in_at', { useTz: true });
      table.timestamp('out_at', { useTz: true });
      table.integer('duration_min');
      table.string('flag', 15);
      table.timestamps(true, true);
      table.index(['user_id', 'work_date']);
    })

    // 9. Day summaries (references users)
    .createTable('day_summaries', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.date('work_date').notNullable();
      table.string('status', 15).notNullable();
      table.timestamp('first_in', { useTz: true });
      table.timestamp('last_out', { useTz: true });
      table.integer('work_min').defaultTo(0);
      table.integer('break_min').defaultTo(0);
      table.integer('permission_min').defaultTo(0);
      table.boolean('is_late').defaultTo(false);
      table.boolean('excess_break').defaultTo(false);
      table.boolean('needs_regularization').defaultTo(false);
      table.decimal('lop_value', 3, 2).defaultTo(0);
      table.boolean('is_locked').defaultTo(false);
      table.timestamps(true, true);
      table.unique(['user_id', 'work_date']);
    })

    // 10. Permission requests (references users)
    .createTable('permission_requests', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.date('perm_date').notNullable();
      table.time('start_time').notNullable();
      table.integer('minutes').notNullable();
      table.text('reason').notNullable();
      table.boolean('is_retroactive').notNullable();
      table.string('status', 10).notNullable().defaultTo('PENDING');
      table.bigInteger('decided_by').references('id').inTable('users');
      table.timestamp('decided_at', { useTz: true });
      table.text('decision_note');
      table.timestamps(true, true);
    })

    // 11. Holidays (no foreign keys)
    .createTable('holidays', function(table) {
      table.bigIncrements('id').primary();
      table.date('holiday_date').notNullable().unique();
      table.string('name', 80).notNullable();
      table.integer('year').notNullable();
      table.timestamps(true, true);
    })

    // 12. Settings (no foreign keys)
    .createTable('settings', function(table) {
      table.string('key', 50).primary();
      table.jsonb('value').notNullable();
      table.timestamps(true, true);
    })

    // 13. Salary structures (references users)
    .createTable('salary_structures', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.decimal('basic', 10, 2).notNullable();
      table.decimal('hra', 10, 2).defaultTo(0);
      table.decimal('special_allowance', 10, 2).defaultTo(0);
      table.decimal('gross', 10, 2).notNullable();
      table.date('effective_from').notNullable();
      table.date('effective_to');
      table.timestamps(true, true);
    })

    // 14. Payroll runs (references users)
    .createTable('payroll_runs', function(table) {
      table.bigIncrements('id').primary();
      table.integer('month').notNullable();
      table.integer('year').notNullable();
      table.string('status', 10).notNullable().defaultTo('DRAFT');
      table.bigInteger('finalized_by').references('id').inTable('users');
      table.timestamp('finalized_at', { useTz: true });
      table.timestamps(true, true);
      table.unique(['year', 'month']);
    })

    // 15. Payroll items (references payroll_runs and users)
    .createTable('payroll_items', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('payroll_run_id').references('id').inTable('payroll_runs').notNullable();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.decimal('gross', 10, 2).notNullable();
      table.integer('calendar_days');
      table.decimal('payable_days', 4, 1);
      table.decimal('lop_days', 4, 1);
      table.decimal('per_day', 10, 2);
      table.decimal('lop_amount', 10, 2);
      table.jsonb('other_earnings').defaultTo('[]');
      table.jsonb('other_deductions').defaultTo('[]');
      table.decimal('net_pay', 10, 2).notNullable();
      table.text('remarks');
      table.timestamps(true, true);
      table.unique(['payroll_run_id', 'user_id']);
    })

    // 16. Payslips (references payroll_items and users)
    .createTable('payslips', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('payroll_item_id').references('id').inTable('payroll_items').notNullable().unique();
      table.bigInteger('user_id').references('id').inTable('users').notNullable();
      table.integer('month').notNullable();
      table.integer('year').notNullable();
      table.string('pdf_path', 255).notNullable();
      table.timestamp('published_at', { useTz: true });
      table.timestamps(true, true);
    })

    // 17. Audit log (references users)
    .createTable('audit_log', function(table) {
      table.bigIncrements('id').primary();
      table.bigInteger('actor_id').references('id').inTable('users').notNullable();
      table.string('action', 50).notNullable();
      table.string('entity_type', 30);
      table.bigInteger('entity_id');
      table.jsonb('before');
      table.jsonb('after');
      table.text('reason');
      table.timestamps(true, true);
    })
    
};



exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('audit_log')
    .dropTableIfExists('payslips')
    .dropTableIfExists('payroll_items')
    .dropTableIfExists('payroll_runs')
    .dropTableIfExists('salary_structures')
    .dropTableIfExists('settings')
    .dropTableIfExists('holidays')
    .dropTableIfExists('permission_requests')
    .dropTableIfExists('day_summaries')
    .dropTableIfExists('attendance_sessions')
    .dropTableIfExists('leave_ledger')
    .dropTableIfExists('leave_requests')
    .dropTableIfExists('correction_punches')
    .dropTableIfExists('regularization_requests')
    .dropTableIfExists('raw_punches')
    .dropTableIfExists('devices')
    .dropTableIfExists('users')
  

};