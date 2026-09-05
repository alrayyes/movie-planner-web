import { IndexedDbCredentialsStore } from "./indexeddb-store";
import type { CredentialsStore } from "./types";

export type { Credentials, CredentialsStore } from "./types";

let instance: CredentialsStore | undefined;

export function getCredentialsStore(): CredentialsStore {
  instance ??= new IndexedDbCredentialsStore();
  return instance;
}

// #127: fired on `window` right after credentials-gate.ts saves a
// visitor's credentials for the first time — <site-nav> listens for
// this to pick up the change without a full page reload, since its own
// initial connectedCallback already ran (and found nothing to link to
// yet) before this fires.
export const CREDENTIALS_CONNECTED_EVENT = "movie-planner-web:credentials-connected";
