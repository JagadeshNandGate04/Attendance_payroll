function formatDateOnly(value) {
  if (!value && value !== 0) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);

    if (!Number.isNaN(parsed.getTime())) {
      return [
        parsed.getUTCFullYear(),
        String(parsed.getUTCMonth() + 1).padStart(2, '0'),
        String(parsed.getUTCDate()).padStart(2, '0'),
      ].join('-');
    }

    return trimmed.slice(0, 10);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return null;
  }

  const parsed = new Date(stringValue);

  if (!Number.isNaN(parsed.getTime())) {
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-');
  }

  return stringValue.slice(0, 10);
}

module.exports = { formatDateOnly };