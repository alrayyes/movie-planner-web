## 1. Project Scaffold & Deploy Placeholder

- [x] 1.1 Scaffold the repo with pinned Astro/Cloudflare Workers tooling (Bun, Biome, Playwright+axe, Vale/LTeX, release-please, Dependabot); verify `bun install` and `bun run dev` both succeed
- [x] 1.2 Add a single hello-world placeholder page at `/`; verify `bun run build` produces a `dist/` output
- [x] 1.3 Wire the Cloudflare Workers deploy config (`wrangler.jsonc`, `@astrojs/cloudflare` adapter) so the placeholder is deployable; verify `bun run build` and `bun run preview` (wrangler dev) both serve it correctly
- [x] 1.4 Confirm with the user that their Cloudflare preview/prod build setup (tracked in a separate forge issue) is working against this placeholder before continuing past this section

## 2. Credentials & Settings

- [x] 2.1 Build the first-load credentials screen (CalDAV URL, username, password, optional OMDb key); verify a Playwright test confirms it's the only thing shown with no stored credentials
- [x] 2.2 Implement browser-only credential storage (IndexedDB); verify a test confirms a reload with stored credentials skips the first-load screen
- [x] 2.3 Build the `/settings` screen for editing stored credentials; verify a Playwright test edits and re-saves a credential and confirms it's used on the next CalDAV call
- [x] 2.4 Verify `credentials` spec scenarios all have a corresponding automated test

## 3. CalDAV Proxy (superseded — see section 11)

Built as specified at the time; reversed in section 11 once it became clear
a stateless, nothing-logged proxy still exposed every visitor's
credentials to the operator's infrastructure in transit. Left checked
here as an accurate record of what shipped and when — section 11 is
where the reversal is tracked and verified.

- [x] 3.1 Implement the Astro API routes (Worker functions) for the fixed CalDAV operation set: list events in range, get/create/update/delete event, get/update sidecar; verify each has a unit test against a mocked CalDAV response
- [x] 3.2 Add HTTPS-only validation on the supplied base URL; verify a test confirms a `http://` URL is rejected without an outbound call
- [x] 3.3 Add request timeout and response size cap; verify tests cover both an unresponsive and an oversized mock response
- [x] 3.4 Verify `caldav-proxy` spec scenarios all have a corresponding automated test

## 4. Calendar Overview

- [x] 4.1 Build the overview screen rendering title, start/end time, medium, venue, director, actors, and ratings per entry; verify a Playwright test against a mocked calendar with full metadata
- [x] 4.2 Add date-range and medium filters; verify a Playwright test filters to an expected subset
- [x] 4.3 Add a Playwright journey test with an axe-core scan on this page, per the project's accessibility rule; verify it fails on an introduced violation and passes clean
- [x] 4.4 Verify `calendar-overview` spec scenarios all have a corresponding automated test

## 5. Logging a Viewing

- [x] 5.1 Build the manual log form (title, date, start/end time, medium, venue); verify a Playwright test submits it and confirms the resulting CalDAV event
- [x] 5.2 Build Pathé email paste/upload parsing (title, date, times, cinema, booking number) with a confirm-before-write step; verify unit tests cover parsing and a Playwright test covers the confirm flow
- [x] 5.3 Implement re-submission-updates-existing-entry behaviour keyed on booking number; verify a test covers a duplicate submission
- [x] 5.4 Implement best-effort OMDb enrichment (auto-pick the closest match, no disambiguation prompt) behind the optional API key; verify a test covers both the key-set and key-absent paths
- [x] 5.5 Add a Playwright + axe-core scan on the log screen; verify it passes clean
- [x] 5.6 Verify `movie-log` spec scenarios all have a corresponding automated test

## 6. Editing a Viewing

- [x] 6.1 Build update (edit any field) from the overview; verify a Playwright test edits an entry and confirms the CalDAV event changed
- [x] 6.2 Build delete with a confirmation step; verify a Playwright test confirms the CalDAV event is removed only after confirming
- [x] 6.3 Verify `movie-editing` spec scenarios all have a corresponding automated test

## 7. Bulk Import

- [x] 7.1 Build CSV/JSON file upload using the CLI's import field format; verify a test confirms both formats parse correctly
- [x] 7.2 Implement duplicate detection (fuzzy title + date) against both the import file and the existing calendar, with a confirm step; verify a test covers a within-file and an against-calendar duplicate
- [x] 7.3 Verify `bulk-import` spec scenarios all have a corresponding automated test

## 8. Location Management

- [x] 8.1 Implement the sidecar `VJOURNAL` (`movie-planner-web-config` UID) read/write, encoding media/venue picklists in its `DESCRIPTION`; verify a unit test round-trips the encoding
- [x] 8.2 Wire picklists into the log form's medium/venue fields; verify a Playwright test confirms a previously-added venue appears as a choice
- [x] 8.3 Handle a missing or unparsable sidecar as an empty picklist rather than an error; verify a test covers both cases
- [x] 8.4 Verify `location-management` spec scenarios all have a corresponding automated test

## 9. Documentation

- [x] 9.1 Write the top-level `README.md` — what the app is, how to run it, its requirements, its configuration, where it deploys — per the project's README rule
- [x] 9.2 State plainly that this has only been tested against Baikal and other CalDAV servers may or may not work
- [x] 9.3 Document that the operator never stores visitor credentials, and where in the code that claim can be verified

## 10. Final Verification

- [x] 10.1 Run the full test suite (unit + Playwright + axe-core) and confirm it's green
- [x] 10.2 Run `openspec validate --change "add-movie-planner-web-app" --strict` and confirm it passes

## 11. CalDAV/OMDb: Remove the Server-Side Proxy

Reverses section 3 — see design.md's "Fully static" decision for why: a
stateless, nothing-logged proxy still held every visitor's plaintext
credentials in memory per request, and the goal became zero credential
exposure to any server this project runs, not just zero persistence.

- [x] 11.1 Move CalDAV client logic to run entirely in the browser (`src/lib/caldav/client.ts`, already fetch()-based and browser-compatible as-is); remove `src/pages/api/caldav/**` and `src/lib/caldav/api-client.ts`; verify existing unit tests against `client.ts` still pass unchanged
- [x] 11.2 Move OMDb lookup to run entirely in the browser (`src/lib/omdb/client.ts`); remove `src/pages/api/omdb/lookup.ts`; verify OMDb's own CORS support (`Access-Control-Allow-Origin: *`, confirmed live) makes this viable
- [x] 11.3 Switch the build to fully static (`astro.config.mjs`: `output: "static"`, no adapter) and update `wrangler.jsonc` to serve `dist/` as assets with no Worker script; verify `bun run build` and `bun run preview` both serve the app correctly with no server-side routes
- [x] 11.4 Update every Playwright test that mocked `/api/caldav/**`/`/api/omdb/**` to mock the visitor's CalDAV/OMDb server directly instead (`tests/support/mock-caldav.ts`, simulating real REPORT/PUT/GET/DELETE and multistatus/iCal wire behaviour); delete `tests/caldav-proxy.spec.ts` (its "fixed operation set" requirement no longer applies — there's no relay left to constrain)
- [x] 11.5 Add CORS headers to `test/integration/Caddyfile` (the required `Access-Control-Allow-*` headers, plus answering the credential-less preflight `OPTIONS` request before it reaches Baikal) and a test proving a cross-origin request against the real Baikal+Caddy stack succeeds; verify `bun run test:integration` passes
- [x] 11.6 Update README.md with the CORS requirement (exact headers, a link to the tested Caddy example) and the updated credential-handling claim (never transits any server this project runs, not just "never stored"); update CONTRIBUTING.md/CLAUDE.md's architecture description to match
- [x] 11.7 Verify `caldav-client` spec (renamed from `caldav-proxy`) scenarios all have a corresponding automated test
