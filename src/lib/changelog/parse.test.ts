import { describe, expect, test } from "bun:test";
import { type ChangelogRelease, compareReleasesNewestFirst, parseChangelog } from "./parse";

function release(overrides: Partial<ChangelogRelease>): ChangelogRelease {
  return { version: "1.0.0", date: "2026-01-01", entries: [], ...overrides };
}

describe("parseChangelog", () => {
  test("keeps an entry from a real product scope", () => {
    const markdown = `# Changelog

## [0.79.2](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v0.79.1...movie-planner-web-v0.79.2) (2026-09-08)


### Bug Fixes

* **calendar-overview:** show the share link as visible text, not just an attempted copy ([#364](https://github.com/alrayyes/movie-planner-web/issues/364)) ([1500906](https://github.com/alrayyes/movie-planner-web/commit/1500906a9cc281caa5e1a803d0254459ea8da563))
`;

    const releases = parseChangelog(markdown);

    expect(releases).toEqual([
      {
        version: "0.79.2",
        date: "2026-09-08",
        entries: [
          {
            type: "fix",
            scope: "calendar-overview",
            description: "show the share link as visible text, not just an attempted copy",
            prNumber: 364,
            prUrl: "https://github.com/alrayyes/movie-planner-web/issues/364",
          },
        ],
      },
    ]);
  });

  test("drops an entry whose scope is internal (deps-dev), keeping a mixed release's real entry", () => {
    const markdown = `# Changelog

## [0.80.0](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v0.79.3...movie-planner-web-v0.80.0) (2026-09-09)


### Features

* **movie-details:** embed the trailer instead of just linking to it ([#354](https://github.com/alrayyes/movie-planner-web/issues/354)) ([c3ca2a7](https://github.com/alrayyes/movie-planner-web/commit/c3ca2a705bba94024ac30e064f14f8c211165125))


### Bug Fixes

* **deps-dev:** bump the bun-dependencies group with 3 updates ([#331](https://github.com/alrayyes/movie-planner-web/issues/331)) ([9379d38](https://github.com/alrayyes/movie-planner-web/commit/9379d38b5fd7295d7b506dc2cc850fbacf67658e))
`;

    const releases = parseChangelog(markdown);

    expect(releases).toHaveLength(1);
    expect(releases[0]?.entries).toHaveLength(1);
    expect(releases[0]?.entries[0]?.scope).toBe("movie-details");
  });

  test("omits a release entirely when every entry in it is internal-scoped", () => {
    const markdown = `# Changelog

## [0.79.4](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v0.79.3...movie-planner-web-v0.79.4) (2026-09-10)


### Bug Fixes

* **ci:** regenerate bun.lock with the pinned bun version ([#3](https://github.com/alrayyes/movie-planner-web/issues/3)) ([641f295](https://github.com/alrayyes/movie-planner-web/commit/641f2951a2f4ad12c0f458e8067db43cab8d1726))

## [0.79.3](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v0.79.2...movie-planner-web-v0.79.3) (2026-09-08)


### Bug Fixes

* **movie-details:** show just the date when Start and End are identical ([#367](https://github.com/alrayyes/movie-planner-web/issues/367)) ([f76797c](https://github.com/alrayyes/movie-planner-web/commit/f76797c1))
`;

    const releases = parseChangelog(markdown);

    expect(releases.map((r) => r.version)).toEqual(["0.79.3"]);
  });

  test("parses multiple releases in order with their own version and date", () => {
    const markdown = `# Changelog

## [0.79.0](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v0.78.0...movie-planner-web-v0.79.0) (2026-09-07)


### Features

* **calendar-overview:** show a map of the currently-filtered viewings ([#356](https://github.com/alrayyes/movie-planner-web/issues/356)) ([1dff2c4](https://github.com/alrayyes/movie-planner-web/commit/1dff2c49fc2db047a61aabb07423eaa8b5b26793))

## [0.78.0](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v0.77.0...movie-planner-web-v0.78.0) (2026-09-07)


### Features

* **movie-details:** embed the trailer instead of just linking to it ([#354](https://github.com/alrayyes/movie-planner-web/issues/354)) ([c3ca2a7](https://github.com/alrayyes/movie-planner-web/commit/c3ca2a705bba94024ac30e064f14f8c211165125))
`;

    const releases = parseChangelog(markdown);

    expect(releases.map((r) => ({ version: r.version, date: r.date }))).toEqual([
      { version: "0.79.0", date: "2026-09-07" },
      { version: "0.78.0", date: "2026-09-07" },
    ]);
  });
});

describe("compareReleasesNewestFirst", () => {
  test("sorts by version number, not the date string, when several releases share a date", () => {
    // #369's own bug: a plain date comparison leaves same-day releases
    // in whatever order the collection happened to return them, which
    // isn't guaranteed to be newest-first.
    const releases = [
      release({ version: "0.79.1", date: "2026-09-08" }),
      release({ version: "0.79.3", date: "2026-09-08" }),
      release({ version: "0.79.2", date: "2026-09-08" }),
    ];

    releases.sort(compareReleasesNewestFirst);

    expect(releases.map((r) => r.version)).toEqual(["0.79.3", "0.79.2", "0.79.1"]);
  });

  test("sorts a minor version above a later patch of an older minor", () => {
    const releases = [
      release({ version: "0.79.5", date: "2026-09-10" }),
      release({ version: "0.80.0", date: "2026-09-09" }),
    ];

    releases.sort(compareReleasesNewestFirst);

    expect(releases.map((r) => r.version)).toEqual(["0.80.0", "0.79.5"]);
  });
});
