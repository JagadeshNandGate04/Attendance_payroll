function isShortNotice(fromDate, today) {
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return fromDate >= today && fromDate <= tomorrow.toISOString().slice(0, 10);
}

module.exports = { isShortNotice };
