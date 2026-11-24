function isLopAdjustableStatus(status) {
  return status === "ABSENT" || status === "UNINFORMED";
}

function getLocalDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TIMEZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getLocalDayBounds(date) {
  const start = moment.tz(date, "YYYY-MM-DD", true, process.env.TIMEZONE || "Asia/Kolkata");
  if (!start.isValid()) throw new Error("Invalid attendance date");
  return { start: start.toDate(), end: start.clone().add(1, "day").toDate() };
}

module.exports = { isLopAdjustableStatus, getLocalDateString, getLocalDayBounds };
const moment = require("moment-timezone");
