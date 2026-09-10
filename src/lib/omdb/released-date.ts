const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// #142's own split: the weekday abbreviation stays English regardless
// of whatever locale the rest of a date is rendered in elsewhere in
// this app (src/lib/ui/datetime.ts's own WEEKDAY_LOCALE) — kept as its
// own constant here rather than importing that one, since this module
// has no other dependency on datetime.ts and the two are allowed to
// drift independently if that ever needs to change.
const WEEKDAY_LOCALE = "en-US";

export interface ReleasedDateFilters {
  year: string;
  month: string; // YYYY-MM
  date: string; // YYYY-MM-DD
}

// #373: OMDb's own "Released" field is always "DD MMM YYYY" or the
// "N/A" sentinel — never guessed past that shape, matching this app's
// existing rule for every other optional OMDb field. Returns the three
// filter-value granularities the overview's own releasedYear/
// releasedMonth/releasedDate filters compare against, so both sides of
// that comparison are built from this one parser.
export function parseReleasedDate(released: string): ReleasedDateFilters | null {
  const match = released.match(/^(\d{1,2}) (\w{3}) (\d{4})$/);
  if (!match) return null;
  const [, day, monthName, year] = match;
  const monthIndex = MONTHS.indexOf(monthName ?? "");
  if (monthIndex === -1) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = pad(monthIndex + 1);
  return {
    year: year ?? "",
    month: `${year}-${month}`,
    date: `${year}-${month}-${pad(Number(day))}`,
  };
}

// #545: the movie details page's own Released field shows the day of
// week alongside the raw date. Built from parseReleasedDate's own
// parsed components via the local Date constructor (matching
// datetime.ts's localDayBoundary — never `new Date("22 Oct 1994")`
// string parsing, which some engines read as UTC and can land on the
// wrong local day) — not a second, independent parser.
export function releasedDayOfWeek(released: string): string | null {
  const parsed = parseReleasedDate(released);
  if (!parsed) return null;
  const [year, month, day] = parsed.date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(WEEKDAY_LOCALE, { weekday: "short" });
}
