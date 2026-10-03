# 4. Svelte islands alongside Web Components

Status: accepted

## Context

The original design chose no frontend framework: plain TypeScript and Web
Components, to keep the dependency footprint small. It named the cost, which was
more handwritten DOM wiring once the filterable overview and the edit flows
arrived, and said to revisit if that got painful. It did. The largest components
were more than 400 lines of manual re-rendering after every state change.

## Decision

New interactive components are Svelte islands inside Astro. Existing Web
Components stay and coexist in the same view. Nothing is rewritten in one go: a
component converts only when it needs real rework anyway. Components that are
small or mostly a one-time switch aren't worth converting.

Islands that read stored credentials use `client:only`, not `client:load`,
because credentials don't exist during the static build.

## Consequences

- Two component styles live in the repo for as long as conversion stays
  opportunistic. A reader should expect either.
- A Svelte island can't render credential-dependent output at build time.

This reverses the original "no frontend framework" decision. Source: issue #102,
and `openspec/changes/archive/2026-09-04-add-movie-planner-web-app/design.md`
(Decisions).
