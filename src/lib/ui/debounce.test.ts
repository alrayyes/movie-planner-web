import { describe, expect, mock, test } from "bun:test";
import { debounce } from "./debounce";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("debounce", () => {
  test("calls the wrapped function once, after the delay, with the last call's arguments", async () => {
    const fn = mock((_value: string) => {});
    const debounced = debounce(fn, 20);

    debounced("first");
    debounced("second");
    debounced("third");
    expect(fn).not.toHaveBeenCalled();

    await wait(40);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
  });

  test("fires again after the delay elapses between separate calls", async () => {
    const fn = mock((_value: string) => {});
    const debounced = debounce(fn, 20);

    debounced("first");
    await wait(40);
    debounced("second");
    await wait(40);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  // #902: closing a dialog must be able to drop a call that has not fired yet.
  test("cancel drops a pending call", async () => {
    const fn = mock((_value: string) => {});
    const debounced = debounce(fn, 20);

    debounced("pending");
    debounced.cancel();
    await wait(40);

    expect(fn).not.toHaveBeenCalled();
  });

  test("cancel with nothing pending does nothing, and the next call still fires", async () => {
    const fn = mock((_value: string) => {});
    const debounced = debounce(fn, 20);

    expect(() => debounced.cancel()).not.toThrow();
    debounced("later");
    await wait(40);

    expect(fn).toHaveBeenCalledWith("later");
  });

  test("a call made after a cancel fires normally", async () => {
    const fn = mock((_value: string) => {});
    const debounced = debounce(fn, 20);

    debounced("dropped");
    debounced.cancel();
    debounced("kept");
    await wait(40);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("kept");
  });
});
