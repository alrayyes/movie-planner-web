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

  // #648: a PR merged via "Create a merge commit" (rather than squash)
  // produces this shape instead — a bare commit-SHA link with no PR
  // number right after the description, and a separate "closes [#NNN]"
  // clause (from the original commit's own "Closes #NNN" trailer).
  // Real excerpt from this repo's own CHANGELOG.md (1.12.2/#644).
  test("keeps a merge-commit-shaped entry (bare commit link, trailing 'closes #NNN')", () => {
    const markdown = `# Changelog

## [1.12.2](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v1.12.1...movie-planner-web-v1.12.2) (2026-09-21)


### Bug Fixes

* **omdb:** show a loading status and bounded scroll for a larger search ([2dc6ca1](https://github.com/alrayyes/movie-planner-web/commit/2dc6ca1094620d73df1cd6b7c86d2a511e0e5b32)), closes [#623](https://github.com/alrayyes/movie-planner-web/issues/623)
`;

    const releases = parseChangelog(markdown);

    expect(releases).toEqual([
      {
        version: "1.12.2",
        date: "2026-09-21",
        entries: [
          {
            type: "fix",
            scope: "omdb",
            description: "show a loading status and bounded scroll for a larger search",
            prNumber: 623,
            prUrl: "https://github.com/alrayyes/movie-planner-web/issues/623",
          },
        ],
      },
    ]);
  });

  // #648: the same merge-commit-strategy PR also produces a second,
  // near-duplicate line — the merge commit's own body carries the PR's
  // Conventional-Commits-formatted title (this repo's
  // `merge_commit_message` setting is PR_TITLE), which release-please
  // treats as a distinct commit. That synthesized "Merge pull request
  // #NNN..." message has no "closes" trailer of its own, so the line
  // matches neither ENTRY_LINE nor ENTRY_LINE_MERGE_COMMIT and drops out
  // — no explicit dedup needed, just the one real entry above.
  test("drops the merge commit's own near-duplicate line (no 'closes' clause, no dedup needed)", () => {
    const markdown = `# Changelog

## [1.12.2](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v1.12.1...movie-planner-web-v1.12.2) (2026-09-21)


### Bug Fixes

* **omdb:** show a loading status and bounded scroll for a larger search ([6cd91d7](https://github.com/alrayyes/movie-planner-web/commit/6cd91d75750516859befa9699e6ecf36b1dd475c))
* **omdb:** show a loading status and bounded scroll for a larger search ([2dc6ca1](https://github.com/alrayyes/movie-planner-web/commit/2dc6ca1094620d73df1cd6b7c86d2a511e0e5b32)), closes [#623](https://github.com/alrayyes/movie-planner-web/issues/623)
`;

    const releases = parseChangelog(markdown);

    expect(releases).toHaveLength(1);
    expect(releases[0]?.entries).toHaveLength(1);
    expect(releases[0]?.entries[0]?.prNumber).toBe(623);
  });

  // #648: a merge-commit-shaped entry whose own commit message had no
  // "Closes #NNN" trailer (1.12.1/#642, from a commit predating this
  // repo's habit of including it) has no PR/issue reference anywhere in
  // the text to recover — both duplicate lines are bare commit links,
  // matching neither regex, so the release parses to zero entries and
  // is correctly omitted (same "nothing user-relevant" behavior an
  // all-internal-scoped release already gets). A known, documented gap,
  // not a bug this fix claims to close.
  test("omits a release whose merge-commit-shaped entries have no 'closes' clause at all", () => {
    const markdown = `# Changelog

## [1.12.1](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v1.12.0...movie-planner-web-v1.12.1) (2026-09-21)


### Bug Fixes

* **venue:** bulk-add now selects the venue it just added ([efbc16d](https://github.com/alrayyes/movie-planner-web/commit/efbc16d80ceee93f9f7540cee55cd2318f230c77))
* **venue:** bulk-add now selects the venue it just added ([d6c68c5](https://github.com/alrayyes/movie-planner-web/commit/d6c68c5dec70ceb66dce6ba40a17ade16e95c9b0))

## [1.12.0](https://github.com/alrayyes/movie-planner-web/compare/movie-planner-web-v1.11.0...movie-planner-web-v1.12.0) (2026-09-21)


### Features

* **venue:** bulk-add venue names already seen in viewing history ([2d548f9](https://github.com/alrayyes/movie-planner-web/commit/2d548f9c83997ba49cc858b4e8a4784802ef28bf)), closes [#636](https://github.com/alrayyes/movie-planner-web/issues/636)
`;

    const releases = parseChangelog(markdown);

    expect(releases.map((r) => r.version)).toEqual(["1.12.0"]);
    expect(releases[0]?.entries[0]?.prNumber).toBe(636);
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
