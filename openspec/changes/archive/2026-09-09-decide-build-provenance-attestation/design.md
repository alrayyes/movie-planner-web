## Context

See proposal.md - Why. `release.yml` currently only manages the version bump/tag/changelog (release-please-style), not a build. Cloudflare's own GitHub integration builds and deploys separately, outside any workflow in this repo.

## Goals / Non-Goals

**Goals:** a recorded decision, either way, with reasoning.

**Non-Goals:** attesting Cloudflare's own build — that's Cloudflare's pipeline, not this repo's workflow, and out of this repo's control either way.

## Decisions

Left open — this is the change's own subject, not something to pre-decide in design.md. See tasks.md's review step.

## Open Questions

- Does `release.yml` produce _any_ artifact worth attesting (e.g. the `bun.lock`-pinned dependency tree, a generated changelog), or is "no artifact, no attestation" simply the correct, final answer here?
