// #68: pure, framework-free logic behind <keyboard-nav> — split out so
// the typing-target detection and the "gg" double-press timing can be
// unit tested directly, without driving a real keydown through a
// browser for every case.

// A structural shape, not `instanceof HTMLElement` — this project's
// unit tests run under bun:test with no DOM globals (Playwright covers
// the real-browser behaviour separately), so this stays testable with
// plain objects instead of pulling in a DOM-emulation dependency just
// for one function.
interface TypingTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

// `unknown`, not `EventTarget | null` (a real keydown's own
// `event.target` type) or the structural `TypingTargetLike` itself —
// TypeScript's weak-type check refuses to assign either a real
// EventTarget or a plain object literal to an all-optional-properties
// interface type, from both directions, so the parameter has to be
// wide enough to accept both and narrow internally instead.
function asTypingTargetLike(value: unknown): TypingTargetLike | undefined {
  return typeof value === "object" && value !== null ? (value as TypingTargetLike) : undefined;
}

// A visitor typing into a field shouldn't have j/k/g/? hijacked —
// select and contenteditable aren't in the issue's own acceptance
// criteria (input/textarea only), but skipping them too costs nothing
// and avoids the same class of surprise.
export function isTypingTarget(target: unknown): boolean {
  const el = asTypingTargetLike(target);
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

// "gg" is two separate keydown events, not a single keyboard shortcut
// the browser can report as one — this is what turns them into "did
// the second g arrive soon enough after the first" state. `now` is a
// parameter, not `Date.now()` read internally, so tests can drive it
// with fake timestamps instead of real timers.
export class DoubleKeyTracker {
  private lastPressAt = 0;

  constructor(private readonly windowMs = 500) {}

  // Returns true when this press completes a double press; false when
  // it's the first (and starts the window). Either way, a press that
  // completes a double doesn't chain into a third — it resets.
  press(now: number): boolean {
    const isDouble = now - this.lastPressAt <= this.windowMs;
    this.lastPressAt = isDouble ? 0 : now;
    return isDouble;
  }
}
