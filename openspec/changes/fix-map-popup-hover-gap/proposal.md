## Why

`VenueMap.svelte:138-139` closes a pin's popup on `mouseout` from the marker alone — with a gap between the marker and its popup panel, moving the mouse toward a link inside the popup closes it before the cursor arrives. Confirmed live. Tracked as movie-planner-web#441.

## What Changes

- Track hover across both the marker and the popup's own DOM element, so the popup only closes once the cursor leaves both — not the instant it leaves the marker's small icon.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `venue-map`: popup open/close behaviour on hover.

## Impact

- `src/components/VenueMap.svelte`: marker/popup hover handling.
