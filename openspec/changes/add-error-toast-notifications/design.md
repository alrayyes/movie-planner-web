## Context

See proposal.md - Why. Every component's `role="status"` + `STATUS_TEXT` pattern is small, shared, and consistent — the fix isn't inventing per-component treatments, it's adding one new shared pattern for the error case specifically and pointing every existing error call site at it.

## Goals / Non-Goals

**Goals:** every genuine error across the app gets the same distinct, accessible treatment; routine status text is completely unaffected.

**Non-Goals:** redesigning routine status text, or building a general-purpose notification/toast system for non-error use cases (success confirmations stay as they are today — this is scoped to errors, per the research: toasts are the right pattern specifically for "task-generated, less-severe error" feedback, not a reason to convert every status message).

## Decisions

**One shared component, not per-component styling.** A single `ErrorToast`-style component (or a small composable pattern) takes a message and renders the color/icon/`role="alert"` treatment consistently — every listed component calls it for its error path instead of writing `actionStatusText`/`statusText` to a plain `<p role="status">`.

**Manual dismiss, no auto-timer**, per the design principle that a visitor needs time to read and act on an error (general convention — not a specific citation, called out in the ticket as worth revisiting if it doesn't feel right in practice).

**Position**: near where the action that failed was taken (matches NN/G's "task-generated notifications render where the visitor is working," not a generic global slot) — each component's existing error call site already sits near its own trigger, so this is about _how_ it renders there, not moving it elsewhere on the page.

## Risks / Trade-offs

- [Seven components' error paths need updating — real surface area, not a one-file fix] → tasks.md breaks this out per component so each can be verified independently.
- [A manually-dismissed, non-auto-hiding error could accumulate on screen if several actions fail in sequence] → out of scope to design a full stacking/queue system here; if this becomes a real problem in practice, that's its own follow-up.
