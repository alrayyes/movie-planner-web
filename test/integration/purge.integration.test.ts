// A purge against a real Baikal. The mocked tests can't say whether the
// calendar is really empty afterwards, which is the only thing a purge is for.
// It empties the shared test calendar, so it must not depend on events another
// test file leaves for it; files that sort after this one create their own.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createViewing, deleteViewing, listViewings } from "../../src/lib/caldav/client";
import { listPurgeTargets, purgeCalendar } from "../../src/lib/caldav/purge-calendar";
import { importCheckRange } from "../../src/lib/caldav/range";
import type { CaldavConfig } from "../../src/lib/caldav/types";

const CONFIG: CaldavConfig = {
  baseUrl:
    (process.env.BAIKAL_BASE_URL ?? "https://localhost:8443") +
    "/dav.php/calendars/moviewatcher/movies/",
  username: process.env.BAIKAL_CALDAV_USERNAME ?? "moviewatcher",
  password: process.env.BAIKAL_CALDAV_PASSWORD ?? "testpassword123",
};

beforeAll(() => {
  // Caddy terminates TLS with its own internal CA; see caldav.integration.test.ts.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
});
afterAll(() => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
});

// Another client (a phone, an import) stores an event under a filename of its
// own. The app used to look for `<uid>.ics`, get a 404, call that deleted, and
// leave the event on the calendar.
async function putUnderAnotherFilename(filename: string, uid: string) {
  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//integration test//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20260101T000000Z",
    "DTSTART:20260601T190000Z",
    "DTEND:20260601T210000Z",
    "SUMMARY:Stored elsewhere",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const response = await fetch(CONFIG.baseUrl + filename, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${btoa(`${CONFIG.username}:${CONFIG.password}`)}`,
      "Content-Type": "text/calendar",
    },
    body: ical,
  });
  expect(response.status).toBeLessThan(300);
}

const realDeps = {
  listFresh: listPurgeTargets,
  remove: deleteViewing,
  clearCache: async () => {},
};

describe("purgeCalendar against a real Baikal instance", () => {
  test("one run empties a calendar, including an event stored under another filename", async () => {
    await putUnderAnotherFilename("not-its-uid.ics", "uid-that-is-not-the-filename@example.com");
    const day = 24 * 60 * 60 * 1000;
    const base = Date.now() - 200 * day;
    for (let i = 0; i < 12; i += 6) {
      await Promise.all(
        Array.from({ length: 6 }, (_, k) => {
          const start = new Date(base + (i + k) * day);
          return createViewing(CONFIG, {
            title: `Purge ${i + k}`,
            start: start.toISOString(),
            end: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            medium: "cinema",
          });
        }),
      );
    }
    // The other integration tests share this calendar and leave events behind,
    // so count what is there instead of assuming it started empty.
    const before = (await listViewings(CONFIG, importCheckRange())).length;
    expect(before).toBeGreaterThanOrEqual(13);

    const result = await purgeCalendar(CONFIG, () => {}, realDeps);

    expect(result).toEqual({ deleted: before, failed: 0 });
    expect(await listViewings(CONFIG, importCheckRange())).toEqual([]);
  }, 120_000);
});
