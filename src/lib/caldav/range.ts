// A wide-enough window to cover essentially any import file without the
// visitor having to pick a range up front — mirrors calendar-overview's
// own default range for the same reason.
export function importCheckRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setFullYear(now.getFullYear() - 15);
  const to = new Date(now);
  to.setFullYear(now.getFullYear() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
