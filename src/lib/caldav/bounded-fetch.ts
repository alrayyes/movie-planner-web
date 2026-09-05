import { CaldavRequestTimeoutError, CaldavResponseTooLargeError } from "./errors";

// caldav-client spec, "Bounded outbound requests": every outbound call to a
// visitor's CalDAV server gets a timeout and a response size cap, so a slow
// or misbehaving server doesn't hang the tab indefinitely or stream an
// unbounded response into memory.
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MiB

export interface BoundedFetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  // A caller-supplied signal, distinct from the timeout's own internal
  // one below — lets a caller supersede its own still-in-flight request
  // (a newer reload superseding an older one, say) without that abort
  // being misreported as a server timeout. `timedOut` is what actually
  // distinguishes the two below, not "was the internal controller
  // aborted" (true either way, since the external signal aborts it too).
  signal?: AbortSignal;
}

export async function boundedFetch(
  url: string,
  init: RequestInit,
  options: BoundedFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onExternalAbort);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new CaldavRequestTimeoutError(
        `the CalDAV server did not respond within ${timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onExternalAbort);
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
