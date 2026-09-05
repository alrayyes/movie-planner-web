// #93: every displayed date/time uses Dutch (nl-NL) formatting with a
// 24-hour clock, no AM/PM — a deliberate, consistent choice rather than
// each screen's own browser-default `toLocaleString()` call (which
// varies by visitor and previously showed 12-hour AM/PM in an
// en-US-configured browser). Native `<input type="date">`/
// `type="datetime-local">` pickers are unaffected — those always follow
// the browser/OS's own locale regardless of any JS formatting here.
const LOCALE = "nl-NL";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour12: false });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { hour12: false });
}

// #93: the overview's merged "When" column — one date plus a start-end
// time range for the common same-day case, falling back to two full
// date-times for a viewing that spans midnight.
export function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (start.toDateString() === end.toDateString()) {
    return `${formatDate(startIso)} ${formatTime(startIso)} - ${formatTime(endIso)}`;
  }
  return `${formatDateTime(startIso)} - ${formatDateTime(endIso)}`;
}
