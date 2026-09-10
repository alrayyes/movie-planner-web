## Context

See proposal.md - Why. `site-nav.ts`'s `LINKS` array (8 entries today) renders via `NAV`/`NAV_LINK` classes (`src/lib/ui/classes.ts:37-40`, `flex flex-wrap`) — already wraps to two rows on mobile rather than breaking, confirmed via a live screenshot. `site-breadcrumb.ts`'s `PAGE_NAMES` mirrors the same page set for its Home-then-name breadcrumb trail. `settings.astro` is currently a small (33-line), single-purpose credentials form.

## Goals / Non-Goals

**Goals:**

- Nav fits one row at real mobile widths without hiding any destination behind an icon.
- "Log a viewing" stays reachable from every page, not just Viewings.
- Import/Activity's own page behaviour is completely unchanged — only their entry point moves.

**Non-Goals:**

- A hamburger menu — explicitly considered and rejected (see proposal.md - Why, citing [NN/g's hamburger-menu research](https://www.nngroup.com/articles/hamburger-menus/)).
- Redesigning Import or Activity's own pages — this change only touches how they're reached.
- Removing breadcrumbs or changing their behaviour — `PAGE_NAMES` gets reviewed for consistency, not redesigned.

## Decisions

**A header button, not a nav-list item, for "Log a viewing".** Placing it in the header (alongside keyboard-nav/theme-toggle, matching `Layout.astro`'s existing `header-actions` group) keeps it visually and semantically distinct from "browse a section" links — the standard split between primary CTA and navigation (Gmail's Compose, Letterboxd's +Log). Global, not Viewings-page-only, since logging while browsing another page (Venues, Calendar) is a real flow this app exists to support.

**Settings becomes a hub with links, not an embed.** Linking out to `/import`/`/activity` (rather than embedding their content inline on `/settings`) keeps each page's own existing behaviour, tests, and URL completely untouched — this change is purely about the nav's shape, not a rewrite of those pages. A future change could embed them if that's ever wanted; not needed here.

## Risks / Trade-offs

- [A visitor who used the nav's direct one-click access to Import/Activity now needs two clicks (Settings, then the link)] → accepted, per the recorded reasoning that both are inherently low-frequency (Import: occasional bulk operation; Activity: explicitly "a debugging aid, not a permanent record" per its own code comment) — this is the intended progressive-disclosure trade-off, not an oversight.
- [`site-breadcrumb.ts`'s `PAGE_NAMES` could drift out of sync with the new nav structure if only one file is updated] → both files reviewed together as part of this change, not just `site-nav.ts`.
