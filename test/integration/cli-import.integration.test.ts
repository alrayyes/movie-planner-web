// A real `movie-planner` CLI container importing a file shaped like
// what this app's own "Export as JSON" produces, against the same
// Baikal instance caldav.integration.test.ts already uses — the
// cross-tool half of the "container / integration: real HTTP in
// containers, not mocks" layer. Confirms the field-name contract the
// two projects agreed on (movie-planner-web#69, movie-planner#129)
// actually round-trips between the real tools, not just between this
// repo's own export and import code.
//
// Needs Docker (same as caldav.integration.test.ts) plus the ability
// to pull ghcr.io/alrayyes/movie-planner:latest, a public image — no
// registry auth needed. See CONTRIBUTING.md's "Integration tests"
// section.
//
// --network host (Linux-only, fine for this repo's CI runners): the
// Caddy fixture's own TLS site block is hardcoded to the "localhost"
// hostname (test/integration/Caddyfile), to match what a browser-based
// test already needs — reaching it by the compose network's own
// "caddy" service name instead trips Caddy's TLS handshake (no site
// block matches that SNI), confirmed live.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { listViewings } from "../../src/lib/caldav/client";
import type { CaldavConfig } from "../../src/lib/caldav/types";

const CONFIG: CaldavConfig = {
  baseUrl:
    (process.env.BAIKAL_BASE_URL ?? "https://localhost:8443") +
    "/dav.php/calendars/moviewatcher/movies/",
  username: process.env.BAIKAL_CALDAV_USERNAME ?? "moviewatcher",
  password: process.env.BAIKAL_CALDAV_PASSWORD ?? "testpassword123",
};
const IMAGE = "ghcr.io/alrayyes/movie-planner:latest";
const COMPOSE_FILE = join(import.meta.dir, "compose.yaml");

let workDir: string;

beforeAll(async () => {
  // Caddy terminates TLS for this container with its own internal
  // self-signed CA — never disable certificate verification outside
  // test code like this (same note as caldav.integration.test.ts).
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  workDir = mkdtempSync(join(tmpdir(), "movie-planner-cli-import-"));
  // The container runs as its own uid (1000), which won't generally
  // match whatever created this directory on the host — without this,
  // it can't read the config/fixture it needs or write its own SQLite
  // store, confirmed live ("No config file found").
  chmodSync(workDir, 0o777);

  await $`docker pull ${IMAGE}`.quiet();

  // The CLI's own trusted CA bundle (certifi), plus the Caddy fixture's
  // own internal CA — replacing the CLI's default bundle outright
  // (rather than only adding Caddy's CA) keeps a real outbound HTTPS
  // call reachable too, in case a future fixture row ever needs one.
  const certifiPath = (
    await $`docker run --rm --entrypoint sh ${IMAGE} -c "python3 -c 'import certifi; print(certifi.where())'"`.text()
  ).trim();
  const certifiPem =
    await $`docker run --rm --entrypoint sh ${IMAGE} -c "cat ${certifiPath}"`.text();
  // Regenerated fresh on every `docker compose up` (no persistent
  // volume for it), so this has to be read at test time, not baked in.
  const caddyRootCrt =
    await $`docker compose -f ${COMPOSE_FILE} exec -T caddy cat /data/caddy/pki/authorities/local/root.crt`.text();
  writeFileSync(join(workDir, "combined-ca.pem"), `${certifiPem}\n${caddyRootCrt}`);

  writeFileSync(
    join(workDir, "config.toml"),
    [
      "[caldav]",
      `url = "${CONFIG.baseUrl}"`,
      `username = "${CONFIG.username}"`,
      `password = "${CONFIG.password}"`,
      "",
      "[omdb]",
      'api_key = ""',
      "",
      "[storage]",
      'db_path = "/data/movies.db"',
    ].join("\n"),
  );
});

afterAll(() => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
  rmSync(workDir, { recursive: true, force: true });
});

function runCli(...args: string[]) {
  return $`docker run --rm --network host -v ${workDir}:/data -e MOVIE_PLANNER_CONFIG=/data/config.toml -e SSL_CERT_FILE=/data/combined-ca.pem -e REQUESTS_CA_BUNDLE=/data/combined-ca.pem ${IMAGE} ${args}`.text();
}

describe("movie-planner CLI importing this app's exported format", () => {
  test("every OMDb-derived field lands on the resulting CalDAV entry, with no OMDb call attempted", async () => {
    const fixture = [
      {
        title: "Dune",
        date: "2026-01-01",
        start_time: "19:00",
        end_time: "21:30",
        medium: "cinema",
        venue: "Grand Vista Cinema",
        director: "Denis Villeneuve",
        actors: "Timothée Chalamet, Zendaya",
        genre: "Action, Adventure, Drama",
        release_year: "2021",
        poster_url: "https://example.com/dune-poster.jpg",
        imdb_rating: "8.0",
        rotten_tomatoes_rating: "83%",
        metacritic_rating: "74",
        imdb_url: "https://www.imdb.com/title/tt1160419/",
        letterboxd_url: "https://letterboxd.com/film/dune-part-two/",
        letterboxd_rating: "4.2",
        notes: "Watched with Sam",
      },
    ];
    writeFileSync(join(workDir, "export.json"), JSON.stringify(fixture));

    const output = await runCli("import", "/data/export.json");
    expect(output).toContain("1 imported");
    // A real OMDb call would either be attempted (visible as a
    // "could not fetch"/warning line, since the fixture's api_key is
    // empty) or silently succeed — neither should happen when every
    // OMDb-derived field is already supplied.
    expect(output.toLowerCase()).not.toContain("omdb");

    const viewings = await listViewings(CONFIG, {
      from: "2000-01-01T00:00:00.000Z",
      to: "2100-01-01T00:00:00.000Z",
    });
    const dune = viewings.find((v) => v.title === "Dune");
    expect(dune).toBeDefined();
    expect(dune?.venue).toBe("Grand Vista Cinema");
    expect(dune?.director).toBe("Denis Villeneuve");
    expect(dune?.actors).toBe("Timothée Chalamet, Zendaya");
    expect(dune?.genre).toBe("Action, Adventure, Drama");
    expect(dune?.year).toBe("2021");
    expect(dune?.posterUrl).toBe("https://example.com/dune-poster.jpg");
    expect(dune?.imdbId).toBe("tt1160419");
    expect(dune?.ratingImdb).toBe("8.0");
    expect(dune?.ratingRottenTomatoes).toBe("83%");
    expect(dune?.ratingMetacritic).toBe("74");
    expect(dune?.letterboxdUrl).toBe("https://letterboxd.com/film/dune-part-two/");
    expect(dune?.letterboxdRating).toBe("4.2");
    expect(dune?.notes).toBe("Watched with Sam");
  });
});
