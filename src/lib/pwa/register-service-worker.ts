// #590: registers /sw.js so Chrome's installability check finds a service
// worker with a fetch handler. Deferred to the window "load" event so it
// never competes with the page's own first paint or asset fetches, and
// guarded for browsers (and Astro's SSR-less build, which still parses
// this) without the API.
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
