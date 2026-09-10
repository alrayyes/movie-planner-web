## Why

A wrong OMDb match (or no match at all) is currently invisible unless a
visitor happens to open that specific viewing's details page. There's no
way to see, across the whole log, which viewings are missing which
OMDb-sourced fields — and a gap in a field like genre or director is
usually the first sign the wrong title got matched and needs a refresh.

## What Changes

- Add a new `/missing-data` page listing every logged viewing missing at
  least one of: an IMDb match at all, poster, director, actors, genre, or
  synopsis.
- The page offers a checkbox filter for which of those six gaps to
  include (all checked by default, OR logic — a viewing shows if it's
  missing any checked field), and shows each matching viewing's poster,
  title, watched date, and the specific field(s) it's missing.
- Each row gets the same per-row "Refresh metadata" control the calendar
  overview already offers (including the disambiguation picker on an
  unconfident match), and the page offers a "Refresh all metadata"
  action scoped to whatever the current filter shows.
- Linked from Settings' "More" list, alongside Import/Activity/Docs —
  not the top nav, matching how those already-low-frequency pages are
  reached (#436/#451).

## Capabilities

### New Capabilities

- `missing-data-overview`: a dedicated, filterable list of logged
  viewings missing OMDb-sourced data, to surface likely wrong matches.

### Modified Capabilities

- `movie-editing`: "Refresh OMDb metadata", "Refresh all metadata on
  screen", and "Visible busy state while a refresh is in flight"
  currently describe a single overview (the calendar). These extend to
  cover the new missing-data overview as a second surface offering the
  same per-row and bulk refresh actions.

## Impact

- New page `src/pages/missing-data.astro` and a new
  `MissingDataOverview.svelte` component.
- New helper(s) alongside `src/lib/omdb/metadata.ts` for per-field
  missing-data checks (beyond the existing binary `hasOmdbMetadata`).
- `src/pages/settings.astro`: one more link in the "More" list.
- Reuses `handleRefresh`/`buildOmdbPicker`-equivalent logic and
  `lib/ui/pagination.ts`, following `CalendarOverview.svelte` and
  `AttributeDetail.svelte`'s existing patterns.
