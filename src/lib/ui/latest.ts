// #894: tells an async task whether it is still the newest one by the time it
// settles. A search takes a ticket when it starts and only shows its result if
// the ticket is still the latest; `cancel` makes every ticket taken so far stale
// (a dialog closing with a search in flight).
export function createLatest() {
  let current = 0;
  return {
    next: () => ++current,
    isLatest: (ticket: number) => ticket === current,
    cancel: () => {
      current++;
    },
  };
}
