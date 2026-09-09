## Why

The top nav mixes browsing destinations (Viewings, Venues, Calendar, Map) with a primary create action ("Log a viewing") and low-frequency utility pages (Import, Activity), and wraps to two rows on mobile as a result. Researched from a UX standpoint (2026-09-09): a hamburger menu was considered and rejected — [Hamburger Menus and Hidden Navigation Hurt UX Metrics](https://www.nngroup.com/articles/hamburger-menus/) (Nielsen Norman Group; quantitative remote testing, 6 sites, 179 participants, desktop + mobile) found hiding navigation cuts discoverability by almost half and adds ~2.5s average task time versus visible/partially-visible navigation — a poor fit for this app's small, fixed destination set and single returning visitor. Shrinking the nav itself, and separating the create action and low-frequency pages out, is the better fit. Tracked as movie-planner-web#436.

## What Changes

- "Log a viewing" moves from a nav-list item to a persistent header button (next to the theme toggle), reachable from every page.
- Import and Activity move from top-level nav items to links reached from a Settings hub.
- Top-level nav shrinks to Viewings, Venues, Calendar, Map, Settings — 5 items, fitting one row at real mobile widths.
- `/import` and `/activity` keep working as direct URLs; only their nav entry point changes.

## Capabilities

### New Capabilities

- `site-chrome`: the app's persistent cross-page navigation shape — what the top nav lists, where the primary create action lives, and how low-frequency utility pages are reached. Not previously captured as its own OpenSpec capability (site-nav.ts/site-breadcrumb.ts predate this project's OpenSpec adoption).

### Modified Capabilities

(none)

## Impact

- `src/components/site-nav.ts`: `LINKS` reduced to 5 destinations.
- `src/layouts/Layout.astro`: new persistent "Log a viewing" header button.
- `src/pages/settings.astro`: restructured to link to (or embed) Import and Activity.
- `src/components/site-breadcrumb.ts`: `PAGE_NAMES` reviewed for consistency with the new structure.
