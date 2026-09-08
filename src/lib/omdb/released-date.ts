const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
