import { describe, expect, test } from "bun:test";
import { DoubleKeyTracker, isTypingTarget } from "./bindings";

describe("isTypingTarget", () => {
  test("an input element is a typing target", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
  });

  test("a textarea element is a typing target", () => {
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
  });

  test("a select element is a typing target", () => {
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
  });

  test("a contenteditable element is a typing target regardless of tag", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  test("a plain button is not a typing target", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
  });

  test("a bare div is not a typing target", () => {
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
  });

  test("null is not a typing target", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("DoubleKeyTracker", () => {
  test("a single press is not a double", () => {
    const tracker = new DoubleKeyTracker(500);
    expect(tracker.press(1000)).toBe(false);
  });

  test("a second press within the window completes a double", () => {
    const tracker = new DoubleKeyTracker(500);
    tracker.press(1000);
    expect(tracker.press(1300)).toBe(true);
  });

  test("a second press right at the edge of the window still counts", () => {
    const tracker = new DoubleKeyTracker(500);
    tracker.press(1000);
    expect(tracker.press(1500)).toBe(true);
  });

  test("a second press after the window has passed starts a new window instead", () => {
    const tracker = new DoubleKeyTracker(500);
    tracker.press(1000);
    expect(tracker.press(1600)).toBe(false);
  });

  test("a completed double press doesn't chain into a third", () => {
    const tracker = new DoubleKeyTracker(500);
    tracker.press(1000);
    expect(tracker.press(1200)).toBe(true);
    expect(tracker.press(1300)).toBe(false);
  });
});
