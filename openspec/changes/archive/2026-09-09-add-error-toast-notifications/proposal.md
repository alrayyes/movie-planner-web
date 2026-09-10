## Why

Nearly every component shares the same quiet `STATUS_TEXT` style and `role="status"` for both routine status text and genuine errors — confirmed in code across `CalendarOverview.svelte`, `MovieDetails.svelte`, `VenuesOverview.svelte`, `LogViewingForm.svelte`, `ViewingHeatmap.svelte`, `GlobalMap.svelte`, `ActivityLog.svelte`. Only `SharedOverview.svelte` correctly uses `role="alert"`. Researched from a UX/accessibility standpoint (2026-09-09), citing W3C WAI's ARIA19/ARIA22 techniques and NN/G's error-message guidelines (full citations in movie-planner-web#442). Tracked as movie-planner-web#442.

## What Changes

- A shared, visually distinct error-toast treatment (colour, icon, fixed position) for genuine errors, separate from the existing quiet inline status pattern (which stays for routine loading/count/success text).
- Errors use `role="alert"` instead of `role="status"`, so assistive technology announces them immediately rather than queuing them behind routine updates.
- Errors don't auto-dismiss on a short timer — a visitor needs time to read and act on them.
- Rolled out to every existing error call site across the listed components.

## Capabilities

### New Capabilities

- `notifications`: the app's shared pattern for surfacing transient, task-generated feedback — specifically how a genuine error differs from routine status text (visual treatment, ARIA role, dismiss behaviour). Not previously captured as its own capability; each component currently reimplements the same undifferentiated pattern independently.

### Modified Capabilities

(none — existing components adopt the new shared pattern for their error cases, but no existing capability's own requirements describe error presentation today, so there's nothing to modify)

## Impact

- New shared component/pattern (e.g. `src/components/ErrorToast.svelte` or similar), used from every listed component's error path.
- `CalendarOverview.svelte`, `MovieDetails.svelte`, `VenuesOverview.svelte`, `LogViewingForm.svelte`, `ViewingHeatmap.svelte`, `GlobalMap.svelte`, `ActivityLog.svelte`: error-specific call sites converted; routine status text in the same components unaffected.
