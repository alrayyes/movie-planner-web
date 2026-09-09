## Context

See proposal.md - Why. `VenueMap.svelte:126-141` binds `mouseover`/`mouseout` directly on each Leaflet marker to open/close its `bindPopup` content, with a separate `click` handler (`marker.off("click")` + a plain, non-toggling `openPopup()`, per the #262 comment resolving an earlier hover/click conflict). Neither handler accounts for the popup's own DOM element, which Leaflet renders as a separate node positioned near, not overlapping, the marker icon.

## Goals / Non-Goals

**Goals:** a visitor can always reach and click a link inside an open popup, regardless of whether it was opened by hover or click.

**Non-Goals:** changing the click-vs-hover open behaviour itself (#262's existing resolution stays); redesigning the popup's content or styling.

## Decisions

**Track hover state across marker + popup via Leaflet's own popup lifecycle**, using `marker.getPopup()?.getElement()` once the popup opens (Leaflet's `popupopen` event) to attach `mouseover`/`mouseout` listeners on the popup element itself, alongside the existing marker listeners — closing only when the mouse has left both. Considered and rejected: a fixed delay (`setTimeout`) on `mouseout` before closing — simpler to write, but either too short (doesn't fix the bug for a visitor who pauses) or too long (popup lingers oddly after genuinely leaving the area); tracking real hover state on both elements is more correct and no more complex once past the initial "who's listening" wiring.

## Risks / Trade-offs

- [Popup DOM element isn't available until Leaflet actually renders it, so listeners must be attached on open, not at marker-creation time] → use Leaflet's `popupopen` event on the marker to attach popup listeners each time it opens, not once at setup.
