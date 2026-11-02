const DIRECTIONS = {
  IN: 'IN',
  OUT: 'OUT'
};

function validateMonthYear(month, year) {
  if (
    month === undefined ||
    month === null ||
    year === undefined ||
    year === null
  ) {
    throw new Error('Month and year are required');
  }

  const parsedMonth = Number(month);
  const parsedYear = Number(year);

  if (
    !Number.isInteger(parsedMonth) ||
    parsedMonth < 1 ||
    parsedMonth > 12
  ) {
    throw new Error('Invalid month');
  }

  if (
    !Number.isInteger(parsedYear) ||
    parsedYear < 2000 ||
    parsedYear > 2100
  ) {
    throw new Error('Invalid year');
  }

  return {
    month: parsedMonth,
    year: parsedYear
  };
}

function validateDate(date) {
  if (!date) {
    throw new Error('Date is required');
  }

  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    throw new Error(
      'Invalid date format. Use YYYY-MM-DD'
    );
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date');
  }

  const [year, month, day] =
    date.split('-').map(Number);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('Invalid date');
  }

  return date;
}

function validateUserId(userId) {
  if (
    userId === undefined ||
    userId === null ||
    userId === ''
  ) {
    throw new Error('User ID is required');
  }

  const id = Number(userId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new Error('Invalid user ID');
  }

  return id;
}

function getMonthRange(year, month) {
  const paddedMonth =
    String(month).padStart(2, '0');

  const startDate =
    `${year}-${paddedMonth}-01`;

  const nextMonthDate =
    new Date(Date.UTC(year, month, 1));

  const nextYear =
    nextMonthDate.getUTCFullYear();

  const nextMonth =
    String(
      nextMonthDate.getUTCMonth() + 1
    ).padStart(2, '0');

  const endExclusive =
    `${nextYear}-${nextMonth}-01`;

  return {
    startDate,
    endExclusive
  };
}

function removeDuplicatePunches(
  punches,
  duplicateWindow = 3
) {
  if (!punches.length) {
    return [];
  }

  const result = [];

  for (const punch of punches) {
    const previous =
      result[result.length - 1];

    if (!previous) {
      result.push(punch);
      continue;
    }

    const difference =
      Math.abs(
        new Date(punch.punched_at) -
        new Date(previous.punched_at)
      ) / 60000;

    if (
      difference <= duplicateWindow &&
      punch.direction === previous.direction
    ) {
      continue;
    }

    result.push(punch);
  }

  return result;
}

function buildSessions(punches) {
  const sessions = [];

  let openIn = null;

  for (const punch of punches) {
    if (punch.direction === DIRECTIONS.IN) {
      if (!openIn) {
        openIn = punch;
      }

      continue;
    }

    if (punch.direction === DIRECTIONS.OUT) {
      if (!openIn) {
        sessions.push({
          in_at: null,
          out_at: punch.punched_at,
          duration_min: null,
          flag: 'MISSING_IN',
          in_punch: null,
          out_punch: punch
        });

        continue;
      }

      const duration =
        Math.floor(
          (
            new Date(punch.punched_at) -
            new Date(openIn.punched_at)
          ) / 60000
        );

      sessions.push({
        in_at: openIn.punched_at,
        out_at: punch.punched_at,
        duration_min:
          duration >= 0
            ? duration
            : null,
        flag: null,
        in_punch: openIn,
        out_punch: punch
      });

      openIn = null;
    }
  }

  if (openIn) {
    sessions.push({
      in_at: openIn.punched_at,
      out_at: null,
      duration_min: null,
      flag: 'MISSING_OUT',
      in_punch: openIn,
      out_punch: null
    });
  }

  return sessions;
}

function calculateBreakMinutes(sessions) {
  const completed =
    sessions
      .filter(
        session =>
          session.in_at &&
          session.out_at
      )
      .sort(
        (a, b) =>
          new Date(a.in_at) -
          new Date(b.in_at)
      );

  let breakMin = 0;

  for (
    let index = 1;
    index < completed.length;
    index++
  ) {
    const previous =
      completed[index - 1];

    const current =
      completed[index];

    const gap =
      Math.floor(
        (
          new Date(current.in_at) -
          new Date(previous.out_at)
        ) / 60000
      );

    if (gap > 0) {
      breakMin += gap;
    }
  }

  return breakMin;
}

module.exports = {
  DIRECTIONS,
  validateMonthYear,
  validateDate,
  validateUserId,
  getMonthRange,
  removeDuplicatePunches,
  buildSessions,
  calculateBreakMinutes
};