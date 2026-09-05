// #93: every displayed date/time uses Dutch (nl-NL) formatting with a
// 24-hour clock, no AM/PM — a deliberate, consistent choice rather than
// each screen's own browser-default `toLocaleString()` call (which
// varies by visitor and previously showed 12-hour AM/PM in an
// en-US-configured browser). Native `<input type="date">`/
// `type="datetime-local">` pickers are unaffected — those always follow
// the browser/OS's own locale regardless of any JS formatting here.
const LOCALE = "nl-NL";
// #142: the weekday abbreviation alone stays English ("Wed", not "wo")
// while the rest of the date keeps its European day-month-year order —
// a deliberate split, not the whole locale switching, so this needs its
// own Intl call rather than a single options bag.
const WEEKDAY_LOCALE = "en-US";

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString(WEEKDAY_LOCALE, { weekday: "short" });
  const dayMonthYear = date.toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${weekday} ${dayMonthYear}`;
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

// #188: a `<input type="date">` value is a bare "YYYY-MM-DD" naming the
// visitor's own local calendar day (matching the local getters
// toDateInputValue below builds one from). `new Date("YYYY-MM-DD")`
// parses that same string as *UTC* midnight instead — a different
// instant in any timezone but UTC, and one that can even land on the
// wrong local day. Parsing the components by hand into the local-time
// Date constructor keeps the boundary anchored to the calendar day the
// field actually shows, both for the day's start and its end (the
// whole day, not just its first instant).
export function localDayBoundary(value: string, endOfDay: boolean): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  return date.toISOString();
}

export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface BlockedTimeBar {
  positionPercent: number;
  widthPercent: number;
}

const MINUTES_PER_DAY = 24 * 60;

// #199/#188: position/width as percentages of a 24-hour track, computed
// from the viewing's own *local* hour/minute — not UTC — so the bar
// agrees with the Start/End text right above it, which is itself
// rendered in local time via formatDateTime/formatTime above. A
// midnight-crossing viewing is clipped at the track's right edge
// (position + width capped at 100) rather than wrapped or split into a
// second segment — see design.md's own reasoning.
export function computeBlockedTimeBar(startIso: string, endIso: string): BlockedTimeBar {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMinutes = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
  const positionPercent = (startMinutes / MINUTES_PER_DAY) * 100;
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  const rawWidthPercent = (durationMinutes / MINUTES_PER_DAY) * 100;
  const widthPercent = Math.min(rawWidthPercent, 100 - positionPercent);
  return { positionPercent, widthPercent };
}
