## Why

`enforce_admins` is `false` on `main`'s branch protection while this repo runs the zero-click auto-merge pattern (0 required approvals + `dependabot-auto-merge.yml`/`release-auto-merge.yml`). Per `~/.config/claude/rules/releases.md`, `enforce_admins` "stays on" for exactly this pattern, or an admin/bot merge can bypass required checks entirely. Tracked as movie-planner-web#426.

## What Changes

- Turn `enforce_admins` on for `main`'s branch protection.
- Confirm the existing Dependabot/release auto-merge automation still succeeds under the new setting (it may currently rely on the admin bypass to merge).

## Capabilities

### New Capabilities

(none — pure repo configuration)

### Modified Capabilities

(none)

## Impact

- GitHub branch protection settings for `main` (not a file in this repo).
- `.github/workflows/dependabot-auto-merge.yml`, `release-auto-merge.yml`: verify, and adjust if they relied on the bypass.
