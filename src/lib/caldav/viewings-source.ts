import { listViewings } from "./client";
import { importCheckRange } from "./range";
import type { CaldavConfig, LoggedViewing } from "./types";
import {
  accountKeyFor,
  getViewingsCacheStore,
  type ViewingsCacheStore,
  writeEpochFor,
} from "./viewings-cache";

// #715: stale-while-revalidate for the whole-history viewings list that most
// pages need. With a cached copy, a caller gets it straight away and the
// network request runs behind it; `onRefresh` fires only if that answer
// differs. With no cache, it waits for the network as before.
export interface ListAllOptions {
  signal?: AbortSignal;
  onRefresh?: (viewings: LoggedViewing[]) => void;
  onRefreshError?: (error: unknown) => void;
}

export interface ViewingsSourceDeps {
  fetchAll: (config: CaldavConfig) => Promise<LoggedViewing[]>;
  store: ViewingsCacheStore;
  accountKey: (config: CaldavConfig) => Promise<string>;
  writeEpoch: (account: string) => number;
}

interface Fetched {
  viewings: LoggedViewing[];
  // False when a local write landed while the request was out, so the answer
  // may be older than what's now cached.
  current: boolean;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

// The shared request ignores any one caller's signal, so one page's abort
// can't cancel what another page is waiting on. This only stops *this*
// caller waiting.
function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: an abort signal fires once, and the listener is removed when the promise settles, so `once` changes nothing observable.
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function sameViewings(a: LoggedViewing[], b: LoggedViewing[]): boolean {
  if (a.length !== b.length) return false;
  const before = new Map(a.map((v) => [v.uid, JSON.stringify(v)]));
  return b.every((v) => before.get(v.uid) === JSON.stringify(v));
}

export function createViewingsSource(deps: ViewingsSourceDeps) {
  interface Flight {
    startedAt: number;
    request: Promise<Fetched>;
  }
  // The newest request per account. A call only joins a request that started
  // after the call did: one that started earlier may have been sent before a
  // change landed on the server, and handing its answer to a call made after
  // that change would show the change as not having happened (#206's race).
  const newest = new Map<string, Flight>();
  let clock = 0;

  async function accountOf(config: CaldavConfig): Promise<string | null> {
    try {
      return await deps.accountKey(config);
    } catch {
      // No crypto.subtle (an insecure context): no cache, plain fetching.
      return null;
    }
  }

  function fetchShared(
    config: CaldavConfig,
    account: string | null,
    calledAt: number,
  ): Promise<Fetched> {
    const key = account ?? `${config.baseUrl}\n${config.username}`;
    const existing = newest.get(key);
    // Stryker disable next-line EqualityOperator: startedAt and calledAt come from the same counter, so they are never equal.
    if (existing && existing.startedAt > calledAt) return existing.request;

    const startedAt = ++clock;
    const epoch = account ? deps.writeEpoch(account) : 0;
    const request = deps
      .fetchAll(config)
      .then(async (viewings): Promise<Fetched> => {
        // A newer request has started since, or a local write landed while
        // this was out: this answer may be older than what's known now, so it
        // neither updates the cache nor tells a page to redraw.
        const latest = newest.get(key)?.startedAt === startedAt;
        if (!account) return { viewings, current: latest };
        if (!latest || deps.writeEpoch(account) !== epoch) return { viewings, current: false };
        try {
          await deps.store.replaceAll(account, viewings);
        } catch {
          // A cache that can't be written still leaves the page working.
        }
        return { viewings, current: true };
      })
      .finally(() => {
        if (newest.get(key)?.startedAt === startedAt) newest.delete(key);
      });
    newest.set(key, { startedAt, request });
    return request;
  }

  return {
    async listAll(config: CaldavConfig, options: ListAllOptions = {}): Promise<LoggedViewing[]> {
      const calledAt = ++clock;
      const account = await accountOf(config);
      let cached = null;
      if (account) {
        try {
          cached = await deps.store.load(account);
        } catch {
          // Unreadable cache: treat it as empty.
        }
      }

      if (!cached) {
        return (await withSignal(fetchShared(config, account, calledAt), options.signal)).viewings;
      }

      const stale = cached.viewings;
      fetchShared(config, account, calledAt).then(
        ({ viewings, current }) => {
          if (!current || options.signal?.aborted) return;
          if (!sameViewings(stale, viewings)) options.onRefresh?.(viewings);
        },
        (error) => {
          if (options.signal?.aborted) return;
          options.onRefreshError?.(error);
        },
      );
      return stale;
    },

    // Always the network, for callers that must see the server's own state
    // (the activity log diffs against it). Still saves the result, and joins
    // a request another page started just before or after it.
    async fetchFresh(
      config: CaldavConfig,
      options: { signal?: AbortSignal } = {},
    ): Promise<LoggedViewing[]> {
      const calledAt = ++clock;
      const account = await accountOf(config);
      return (await withSignal(fetchShared(config, account, calledAt), options.signal)).viewings;
    },
  };
}

const source = createViewingsSource({
  fetchAll: (config) => listViewings(config, importCheckRange()),
  store: {
    load: (account) => getViewingsCacheStore().load(account),
    replaceAll: (account, viewings) => getViewingsCacheStore().replaceAll(account, viewings),
    upsert: (account, viewing) => getViewingsCacheStore().upsert(account, viewing),
    remove: (account, uid) => getViewingsCacheStore().remove(account, uid),
    retainOnly: (account) => getViewingsCacheStore().retainOnly(account),
  },
  accountKey: accountKeyFor,
  writeEpoch: writeEpochFor,
});

export const listAllViewings = source.listAll;
export const fetchFreshViewings = source.fetchFresh;
