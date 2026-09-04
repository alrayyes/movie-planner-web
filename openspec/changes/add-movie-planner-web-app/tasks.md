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

## 3. CalDAV Proxy

- [ ] 3.1 Implement the Astro API routes (Worker functions) for the fixed CalDAV operation set: list events in range, get/create/update/delete event, get/update sidecar; verify each has a unit test against a mocked CalDAV response
- [ ] 3.2 Add HTTPS-only validation on the supplied base URL; verify a test confirms a `http://` URL is rejected without an outbound call
- [ ] 3.3 Add request timeout and response size cap; verify tests cover both an unresponsive and an oversized mock response
- [ ] 3.4 Verify `caldav-proxy` spec scenarios all have a corresponding automated test

## 4. Calendar Overview

- [ ] 4.1 Build the overview screen rendering title, start/end time, medium, venue, director, actors, and ratings per entry; verify a Playwright test against a mocked calendar with full metadata
- [ ] 4.2 Add date-range and medium filters; verify a Playwright test filters to an expected subset
- [ ] 4.3 Add a Playwright journey test with an axe-core scan on this page, per the project's accessibility rule; verify it fails on an introduced violation and passes clean
- [ ] 4.4 Verify `calendar-overview` spec scenarios all have a corresponding automated test

## 5. Logging a Viewing

- [ ] 5.1 Build the manual log form (title, date, start/end time, medium, venue); verify a Playwright test submits it and confirms the resulting CalDAV event
- [ ] 5.2 Build Pathé email paste/upload parsing (title, date, times, cinema, booking number) with a confirm-before-write step; verify unit tests cover parsing and a Playwright test covers the confirm flow
- [ ] 5.3 Implement re-submission-updates-existing-entry behaviour keyed on booking number; verify a test covers a duplicate submission
- [ ] 5.4 Implement best-effort OMDb enrichment (auto-pick the closest match, no disambiguation prompt) behind the optional API key; verify a test covers both the key-set and key-absent paths
- [ ] 5.5 Add a Playwright + axe-core scan on the log screen; verify it passes clean
- [ ] 5.6 Verify `movie-log` spec scenarios all have a corresponding automated test

## 6. Editing a Viewing

- [ ] 6.1 Build update (edit any field) from the overview; verify a Playwright test edits an entry and confirms the CalDAV event changed
- [ ] 6.2 Build delete with a confirmation step; verify a Playwright test confirms the CalDAV event is removed only after confirming
- [ ] 6.3 Verify `movie-editing` spec scenarios all have a corresponding automated test

## 7. Bulk Import

- [ ] 7.1 Build CSV/JSON file upload using the CLI's import field format; verify a test confirms both formats parse correctly
- [ ] 7.2 Implement duplicate detection (fuzzy title + date) against both the import file and the existing calendar, with a confirm step; verify a test covers a within-file and an against-calendar duplicate
- [ ] 7.3 Verify `bulk-import` spec scenarios all have a corresponding automated test

## 8. Location Management

- [ ] 8.1 Implement the sidecar `VJOURNAL` (`movie-planner-web-config` UID) read/write, encoding media/venue picklists in its `DESCRIPTION`; verify a unit test round-trips the encoding
- [ ] 8.2 Wire picklists into the log form's medium/venue fields; verify a Playwright test confirms a previously-added venue appears as a choice
- [ ] 8.3 Handle a missing or unparsable sidecar as an empty picklist rather than an error; verify a test covers both cases
- [ ] 8.4 Verify `location-management` spec scenarios all have a corresponding automated test

## 9. Documentation

- [ ] 9.1 Write the top-level `README.md` — what the app is, how to run it, its requirements, its configuration, where it deploys — per the project's README rule
- [ ] 9.2 State plainly that this has only been tested against Baikal and other CalDAV servers may or may not work
- [ ] 9.3 Document that the operator never stores visitor credentials, and where in the code that claim can be verified

## 10. Final Verification

- [ ] 10.1 Run the full test suite (unit + Playwright + axe-core) and confirm it's green
- [ ] 10.2 Run `openspec validate --change "add-movie-planner-web-app" --strict` and confirm it passes
