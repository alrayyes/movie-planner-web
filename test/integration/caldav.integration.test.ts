// Real Baikal, real WebDAV wire calls — the testing rule's "container /
// integration: real HTTP in containers, not mocks" layer, catching what
// src/lib/caldav/*.test.ts's mocked fetch can't: whether the REPORT/PUT/
// GET/DELETE calls and the iCalendar codec actually round-trip through a
// real CalDAV server.
//
// Requires `docker compose -f test/integration/compose.yaml up -d
// --wait && ./test/integration/provision-baikal.sh` first — see
// CONTRIBUTING.md's "Integration tests" section. Not run by `bun run test:unit`
// or in CI's default job; a separate `test:integration` script/job, since
// it needs Docker where the default suite doesn't.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createViewing,
  deleteViewing,
  getPicklists,
  getViewing,
  listViewings,
  updatePicklists,
  updateViewing,
} from "../../src/lib/caldav/client";
import type { CaldavConfig, NewViewing } from "../../src/lib/caldav/types";

const CONFIG: CaldavConfig = {
  baseUrl:
    (process.env.BAIKAL_BASE_URL ?? "https://localhost:8443") +
    "/dav.php/calendars/moviewatcher/movies/",
  username: process.env.BAIKAL_CALDAV_USERNAME ?? "moviewatcher",
  password: process.env.BAIKAL_CALDAV_PASSWORD ?? "testpassword123",
};

beforeAll(() => {
  // Caddy terminates TLS for this container with its own internal
  // self-signed CA — never disable certificate verification outside test
  // code like this.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
});

afterAll(() => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
});

describe("caldav client against a real Baikal instance", () => {
  test("creates, gets, lists, updates and deletes a viewing", async () => {
    const viewing: NewViewing = {
      title: "Dune",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:30:00.000Z",
      medium: "cinema",
      venue: "Grand Vista Cinema",
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet, Zendaya",
      ratingImdb: "8.0",
    };

    const created = await createViewing(CONFIG, viewing);
    expect(created.uid).toBeTruthy();

    const fetched = await getViewing(CONFIG, created.uid);
    expect(fetched).toEqual({ uid: created.uid, ...viewing });

    const listed = await listViewings(CONFIG, {
      from: "2025-12-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });
    expect(listed.some((v) => v.uid === created.uid)).toBe(true);

    const updated = await updateViewing(CONFIG, created.uid, {
      ...viewing,
      title: "Dune: Part Two",
    });
    expect(updated.title).toBe("Dune: Part Two");
    expect((await getViewing(CONFIG, created.uid))?.title).toBe("Dune: Part Two");

    await deleteViewing(CONFIG, created.uid);
    expect(await getViewing(CONFIG, created.uid)).toBeNull();
  }, 20_000);

  test("round-trips the location-management sidecar picklists", async () => {
    expect(await getPicklists(CONFIG)).toEqual({ media: [], venues: [] });

    await updatePicklists(CONFIG, { media: ["cinema", "netflix"], venues: ["Grand Vista Cinema"] });

    expect(await getPicklists(CONFIG)).toEqual({
      media: ["cinema", "netflix"],
      venues: ["Grand Vista Cinema"],
    });
  }, 20_000);
});
