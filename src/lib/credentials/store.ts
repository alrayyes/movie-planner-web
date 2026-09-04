import { IndexedDbCredentialsStore } from "./indexeddb-store";
import type { CredentialsStore } from "./types";

export type { Credentials, CredentialsStore } from "./types";

let instance: CredentialsStore | undefined;

export function getCredentialsStore(): CredentialsStore {
  instance ??= new IndexedDbCredentialsStore();
  return instance;
}
