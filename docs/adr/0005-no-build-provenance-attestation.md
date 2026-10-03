# 5. No build-provenance attestation

Status: accepted

## Context

The global releases rule asks for build-provenance attestation where a release
produces an artifact. This repo's release job runs release-please, which tags
the release and writes the changelog and builds nothing. Cloudflare's own GitHub
integration builds and deploys, configured on its dashboard, outside any
workflow file here. `wrangler.jsonc` has no `main` entry, so no server-side
build exists either.

## Decision

Don't adopt `actions/attest-build-provenance`. It attests an artifact built
inside a GitHub Actions job and ties it to that run. No job here builds one.

## Consequences

- Nothing to attest and nothing to verify downstream. A site served as static
  assets publishes no package or binary.
- Revisit if a workflow ever builds a shipped artifact, such as a container image
  or a published package.

Source: issue #427 and
`openspec/changes/archive/2026-09-09-decide-build-provenance-attestation/`.
