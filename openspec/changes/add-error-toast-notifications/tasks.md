## 1. Shared component

- [x] 1.1 Build a shared error-toast component/pattern: `role="alert"`, color + icon + fixed position, no auto-dismiss, manually dismissible
- [x] 1.2 Verify an axe-core scan against a page showing the toast passes WCAG 2.1 AA

## 2. Roll out to every error call site

- [x] 2.1 `CalendarOverview.svelte`: convert error-path `statusText`/`actionStatusText` uses to the new toast; routine status uses unchanged
- [x] 2.2 `MovieDetails.svelte`: same
- [x] 2.3 `VenuesOverview.svelte`: same
- [x] 2.4 `LogViewingForm.svelte`: same
- [x] 2.5 `ViewingHeatmap.svelte`: same
- [x] 2.6 `GlobalMap.svelte`: same
- [x] 2.7 `ActivityLog.svelte`: same
- [x] 2.8 `SharedOverview.svelte`: already uses `role="alert"` — verify it adopts the same shared component for visual consistency, not just the correct ARIA role

## 3. Verification

- [x] 3.1 Playwright coverage: trigger a real failure (e.g. simulate a network error) in at least one component and verify the toast appears with the correct role and doesn't auto-dismiss
- [x] 3.2 Verify routine status messages (loading, counts, success) are unaffected across all touched components
- [x] 3.3 Verify `bun run check`/`lint`/`test` all pass
