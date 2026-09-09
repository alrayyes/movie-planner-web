## 1. Decide

- [x] 1.1 Review `release.yml` and Cloudflare's own deploy integration end to end, and determine whether any artifact this repo's own workflow produces is worth attesting — none: `release.yml` only tags/changelogs via release-please, and Cloudflare's own GitHub integration builds/deploys outside any workflow in this repo
- [x] 1.2 Record the decision (in this change's proposal.md or a linked doc) with reasoning — recorded on movie-planner-web#427

## 2. Implement or close

- [ ] 2.1 If the decision is "yes": add `actions/attest-build-provenance` to `release.yml` for the identified artifact, and verify a release run produces a valid attestation — not applicable
- [x] 2.2 If the decision is "no": close movie-planner-web#427 referencing the recorded reasoning, no code change needed
