// A visitor who deletes (or edits) a viewing, then navigates back with
// the browser's own Back button, can land on a page the browser
// restored whole from its back/forward cache instead of loading fresh —
// that page's own mount-time load() never re-runs, so the restored DOM
// still shows what was true before the change. `pageshow`'s `persisted`
// flag is what tells a bfcache restore apart from a normal load (which
// already ran that mount-time load() itself, so re-running it here too
// would just be a redundant second fetch).
export function reloadOnBfcacheRestore(reload: () => void): void {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reload();
  });
}
