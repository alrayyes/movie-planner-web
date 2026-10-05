import { retainViewingsCacheFor } from "../caldav/viewings-cache";
import { done, openDatabase, result } from "../idb/helpers";
import type { Credentials, CredentialsStore } from "./types";

// Plain browser storage (Option A from the credentials capability spec) —
// no passphrase, no encryption layer. Same-origin + HTTPS is the whole
// protection model, matching the decision recorded there.
const DB_NAME = "movie-planner-web";
const DB_VERSION = 1;
const STORE_NAME = "credentials";
const RECORD_KEY = "current";

function openCredentials(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(STORE_NAME);
  });
}

export class IndexedDbCredentialsStore implements CredentialsStore {
  async get(): Promise<Credentials | null> {
    const db = await openCredentials();
    try {
      const stored = await result<Credentials | undefined>(
        db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY),
      );
      return stored ?? null;
    } finally {
      db.close();
    }
  }

  async save(credentials: Credentials): Promise<void> {
    const db = await openCredentials();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(credentials, RECORD_KEY);
      await done(tx);
    } finally {
      db.close();
    }
    // #715: viewings cached for any other calendar go, so pointing the app
    // at a different one never shows the old one's list.
    await retainViewingsCacheFor({
      baseUrl: credentials.caldavUrl,
      username: credentials.caldavUsername,
    });
  }
}
