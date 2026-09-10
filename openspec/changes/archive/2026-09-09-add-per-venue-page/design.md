## Context

See proposal.md - Why. This app is fully static (`output: "static"`, `astro.config.mjs`) with no server-side application code — confirmed by the existing `/movie?uid=...` pattern's own reasoning (a dynamic per-UID route can't be statically generated, since UIDs are private, visitor-specific data). The same constraint applies to venue names.

Related, sequenced change: movie-planner-web's `remove-venues-page-filter` also touches `location-management`'s "Venues overview page" requirement (removing that requirement's From/To filter). Both changes touch the same requirement from different angles — apply `remove-venues-page-filter` first (it's the simpler, independent change), then this one, to avoid a spec-merge conflict.

## Goals / Non-Goals

**Goals:** a visitor can browse one venue's viewings without the main overview's filter chrome.

**Non-Goals:** rebuilding table/pagination/map logic from scratch — this reuses what `CalendarOverview.svelte`/`VenueMap.svelte` already do, scoped to one venue.

## Decisions

**Full raw venue value, in a `?venue=` query parameter** — matches what `venueHref` and filtering already use, not the display-trimmed name from `trim-venue-display-to-name-and-city` (#440); venue identity/matching always uses the raw stored value, display trimming is presentation-only and orthogonal to this.

**Reuse existing components, don't duplicate.** The exact mechanism (a `CalendarOverview` variant prop that hides filter chrome, vs. a smaller purpose-built component reusing the same table/pagination/map pieces) is left as an implementation-time call — the observable requirement is "no filter controls, locked to one venue," not a specific component structure.

**Breadcrumb reuses the existing dynamic-segment mechanism**, not a new one. `site-breadcrumb.ts`'s `PAGE_NAMES` is a static path-to-label table, but the overview page already has a precedent for a dynamic breadcrumb segment via `ACTIVE_FILTER_LABEL_EVENT` (its own chip-driven-filter breadcrumb, #375). `/venue` broadcasts its venue's trimmed display name the same way, rather than `site-breadcrumb.ts` growing per-venue awareness of its own.

## Risks / Trade-offs

- [Reusing `CalendarOverview.svelte` for this could bloat that already-large component with a new "hide filters" mode] → if that proves awkward at implementation time, a smaller purpose-built component sharing just the table/pagination/map pieces is an acceptable alternative — the spec doesn't mandate which.
