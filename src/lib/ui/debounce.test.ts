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
});
