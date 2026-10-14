import { describe, expect, test } from "bun:test";
import { createLatest } from "./latest";

// #894: an async search can finish after a newer one started; only the newest
// one's result may be shown.
describe("createLatest", () => {
  test("the most recent ticket is the latest", () => {
    const latest = createLatest();
    const first = latest.next();
    expect(latest.isLatest(first)).toBe(true);
  });

  test("an older ticket stops being the latest once a newer one is taken", () => {
    const latest = createLatest();
    const older = latest.next();
    const newer = latest.next();
    expect(latest.isLatest(older)).toBe(false);
    expect(latest.isLatest(newer)).toBe(true);
  });

  test("cancel makes every ticket taken so far stale", () => {
    const latest = createLatest();
    const ticket = latest.next();
    latest.cancel();
    expect(latest.isLatest(ticket)).toBe(false);
  });

  test("a ticket taken after a cancel is the latest again", () => {
    const latest = createLatest();
    latest.next();
    latest.cancel();
    expect(latest.isLatest(latest.next())).toBe(true);
  });

  test("two trackers don't affect each other", () => {
    const a = createLatest();
    const b = createLatest();
    const ticket = a.next();
    b.next();
    b.next();
    expect(a.isLatest(ticket)).toBe(true);
  });
});
