import { CaldavRequestFailedError } from "./errors";

// #842: 423 (locked) and 429 (too many requests) mean "not now", so a bulk
// import waits and tries again instead of counting the row as failed.
const BUSY_STATUSES = new Set([423, 429]);
const ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export interface RetryOptions {
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryWhenBusy<T>(
  fn: () => Promise<T>,
  { sleep = defaultSleep }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const busy = error instanceof CaldavRequestFailedError && BUSY_STATUSES.has(error.status);
      if (!busy || attempt >= ATTEMPTS) throw error;
      await sleep(Math.min(error.retryAfterMs ?? BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS));
    }
  }
}

// A Retry-After header is seconds or an HTTP date. A browser only exposes it
// when the server lists it in Access-Control-Expose-Headers, so a missing one
// is normal and falls back to the exponential delay above.
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (header === null) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
