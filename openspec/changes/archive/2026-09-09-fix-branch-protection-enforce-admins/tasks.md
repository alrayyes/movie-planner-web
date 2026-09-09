## 1. Toggle setting

- [x] 1.1 Enable `enforce_admins` on `main` via `gh api`, and verify `branches/main/protection` reports `enforce_admins.enabled: true`

## 2. Verification

- [ ] 2.1 Trigger (or wait for) a real Dependabot or release PR and verify its auto-merge still succeeds under the new setting — not done: no live Dependabot/release PR was in flight to observe; verified instead by reading both auto-merge workflows, which call `gh pr merge --auto` and rely on GitHub's own required-checks wait, not an admin bypass
- [ ] 2.2 If auto-merge breaks, adjust `dependabot-auto-merge.yml`/`release-auto-merge.yml` as needed and re-verify — not applicable unless 2.1's live check surfaces a problem
