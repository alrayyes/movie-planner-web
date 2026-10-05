// #8/#203: the Nominatim address-search field waits for the visitor to
// stop typing before firing a lookup — a decent UX on its own, and what
// keeps a single visitor's own typing well under Nominatim's ~1
// request/second usage policy (design.md).
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    // Clearing a timer that never started is a no-op, so there's nothing to guard.
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
