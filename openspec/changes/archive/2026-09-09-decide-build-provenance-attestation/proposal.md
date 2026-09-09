## Why

`~/.config/claude/rules/releases.md` says to adopt `actions/attest-build-provenance` "on every GitHub repo, unconditionally." `release.yml` doesn't have it, and no reasoning for the gap is on record — but this repo's `release.yml` doesn't itself build a deployable artifact (Cloudflare's own separate integration handles build/deploy, outside this workflow), so the rule's stated reasoning ("ties the artifact to the workflow run that built it") may not have a subject here. Tracked as movie-planner-web#427 — a decision ticket, not a pre-decided implementation.

## What Changes

- Review the actual release/deploy flow and record a decision: does provenance attestation apply here at all?
- If yes: add `actions/attest-build-provenance` to `release.yml` for whatever artifact it attests.
- If no: record why, as an accepted, reasoned gap — not a silent one.

## Capabilities

### New Capabilities

(none — pure repo/CI configuration, or a documented no-op)

### Modified Capabilities

(none)

## Impact

- `.github/workflows/release.yml`, if the decision is "yes."
- This proposal itself (or a linked note), if the decision is "no" — the reasoning needs to be on record somewhere real, not just in this ticket's history.
