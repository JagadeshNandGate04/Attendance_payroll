function applyHolidayEmployeeScope(query, userId, trx) {
  return query.where(function () {
    this.where("holidays.is_all_employees", true).orWhereExists(function () {
      this.select(trx.raw("1"))
        .from("holiday_employees")
        .whereRaw("holiday_employees.holiday_id = holidays.id")
        .andWhere("holiday_employees.user_id", userId);
    });
  });
}

module.exports = {
  applyHolidayEmployeeScope,
};
