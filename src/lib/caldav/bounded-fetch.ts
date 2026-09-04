import { CaldavRequestTimeoutError, CaldavResponseTooLargeError } from "./errors";

// caldav-proxy spec, "Bounded outbound requests": every outbound call to a
// visitor's CalDAV server gets a timeout and a response size cap, as defense
// in depth alongside the Workers platform's own SSRF blocking (see
// design.md's Decisions).
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MiB

export interface BoundedFetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export async function boundedFetch(
  url: string,
  init: RequestInit,
  options: BoundedFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new CaldavRequestTimeoutError(
        `the CalDAV server did not respond within ${timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxResponseBytes) {
    throw new CaldavResponseTooLargeError(
      `the CalDAV server's response (${contentLength} bytes) exceeds the ${maxResponseBytes} byte limit`,
    );
  }

  return response;
}

// Reads a response body while enforcing the size cap even when the server
// never sent Content-Length — a chunked or misbehaving response could
// otherwise stream past the limit undetected.
export async function readBoundedText(
  response: Response,
  maxResponseBytes = MAX_RESPONSE_BYTES,
): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        throw new CaldavResponseTooLargeError(
          `the CalDAV server's response exceeds the ${maxResponseBytes} byte limit`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
