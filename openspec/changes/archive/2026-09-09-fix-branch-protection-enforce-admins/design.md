## Context

See proposal.md - Why. Confirmed live via `gh api repos/alrayyes/movie-planner-web/branches/main/protection`: `enforce_admins.enabled` is currently `false`.

## Goals / Non-Goals

**Goals:** admin/bot merges go through the same required checks as any other PR.

**Non-Goals:** changing the zero-click auto-merge pattern itself (0 required approvals) — only closing the admin-bypass gap in it.

## Decisions

**Toggle first, then verify, rather than pre-emptively rewriting the auto-merge workflows.** If `dependabot-auto-merge.yml`/`release-auto-merge.yml` already merge through the same check-gated path a normal PR does (likely, since they use `gh pr merge` against a PR that still has to pass CI), the toggle alone is the whole fix. Only touch the workflow files if a real auto-merge run actually breaks under the new setting.

## Risks / Trade-offs

- [Turning this on could block a Dependabot/release PR that was previously merging via the bypass] → verify with a real auto-merge run immediately after the toggle, not just the API setting; roll back the toggle if it breaks and file a follow-up before re-attempting.
