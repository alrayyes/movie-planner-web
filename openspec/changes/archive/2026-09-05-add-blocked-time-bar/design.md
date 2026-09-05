## Context

See proposal.md for motivation. `LoggedViewing.start`/`.end` are the
only inputs needed — both are already loaded on the details page.

## Goals / Non-Goals

**Goals:**

- Compute the bar's position/width from real timestamps in the
  visitor's own local time — the same local-day lesson #188 already
  paid for in `CalendarOverview.svelte` (a UTC-based computation
  silently shifts the bar relative to what the visitor actually sees in
  Start/End, which are themselves rendered in local time via
  `formatDateTime`).
- Keep the bar purely decorative — the existing Start/End fields stay
  the single source of truth for anyone using a screen reader.

**Non-Goals:**

- A multi-day or multi-viewing timeline. This is one bar for one
  viewing's own start/end, nothing else.

## Decisions

**Position/width as percentages of a 24-hour track, computed in local
time.** `positionPercent = (startHours + startMinutes/60) / 24 * 100`,
using the viewing's own local-time hour/minute (`getHours()`/
`getMinutes()`, not `getUTCHours()`) — same reasoning as
`localDayBoundary()`'s fix in `CalendarOverview.svelte`: the visible
Start/End text is already in local time, so the bar has to agree with
it or the two visibly disagree on the same page.

**Clipping a midnight-crossing viewing**: compute `widthPercent` from
the duration in minutes, then cap `positionPercent + widthPercent` at
100 — the bar simply stops at the track's right edge rather than a
second segment or a wrap-around. Chosen for simplicity over correctness
here specifically because the real, precise Start/End text sits right
above it — see proposal.md's own reasoning.

**`aria-hidden="true"` on the bar itself**, no `role`/label of its own.
Duplicating the Start/End text as a second accessible description
would be redundant, and a purely positional/proportional visual (no
inherent text) has nothing better to say than what those fields already
do — same call this app already made for other decorative elements.

## Risks / Trade-offs

- **[A very short viewing renders an unreadably thin sliver]** → Not a
  real risk worth solving — the bar is decorative, and its exact width
  at a small scale isn't information anyone is meant to extract to the
  pixel; the Start/End text above it is.
