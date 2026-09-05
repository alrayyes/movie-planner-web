import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { boundedFetch, readBoundedText } from "./bounded-fetch";
import { CaldavRequestTimeoutError, CaldavResponseTooLargeError } from "./errors";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("boundedFetch", () => {
  test("aborts and throws CaldavRequestTimeoutError when the server never responds", async () => {
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;

    await expect(boundedFetch("https://example.com/", {}, { timeoutMs: 10 })).rejects.toThrow(
      CaldavRequestTimeoutError,
    );
  });

  test("rejects a response whose declared Content-Length exceeds the cap", async () => {
    globalThis.fetch = (async () =>
      new Response("x", {
        status: 200,
        headers: { "content-length": "999999999" },
      })) as unknown as typeof fetch;

    await expect(
      boundedFetch("https://example.com/", {}, { maxResponseBytes: 100 }),
    ).rejects.toThrow(CaldavResponseTooLargeError);
  });

  test("passes through a normal response unchanged", async () => {
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;

    const response = await boundedFetch("https://example.com/", {});
    expect(response.status).toBe(200);
  });

  test("an external signal aborting supersedes the request with a plain AbortError, not a timeout", async () => {
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    const pending = boundedFetch(
      "https://example.com/",
      {},
      // A long timeout — if this rejects with CaldavRequestTimeoutError
      // instead of a plain AbortError, the external signal is being
      // misreported as the (much longer, never-reached) timeout firing.
      { timeoutMs: 60_000, signal: controller.signal },
    );
    controller.abort();

    await expect(pending).rejects.not.toBeInstanceOf(CaldavRequestTimeoutError);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("readBoundedText", () => {
  test("throws when a streamed body (no Content-Length) exceeds the cap", async () => {
    const bigChunk = new Uint8Array(200).fill(97);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bigChunk);
        controller.close();
      },
    });
    const response = new Response(stream);

    await expect(readBoundedText(response, 100)).rejects.toThrow(CaldavResponseTooLargeError);
  });

  test("reads a small streamed body normally", async () => {
    const response = new Response("hello");
    expect(await readBoundedText(response, 100)).toBe("hello");
  });
});
