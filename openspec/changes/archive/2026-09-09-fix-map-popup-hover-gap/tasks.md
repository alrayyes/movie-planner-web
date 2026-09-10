## 1. Fix

- [x] 1.1 On the marker's `popupopen` event, attach `mouseover`/`mouseout` listeners to the popup's own DOM element (`marker.getPopup()?.getElement()`), closing only when the mouse has left both the marker and the popup
- [x] 1.2 Verify manually: hover/click a pin, move the mouse toward a link in its popup, confirm it stays open and the link is clickable

## 2. Test coverage

- [x] 2.1 Add a Playwright test simulating mouse movement from a marker to its popup content and clicking a link inside it
- [x] 2.2 Verify moving away from both marker and popup still closes it

## 3. Verification

- [x] 3.1 Verify touch-device pin-tap behaviour is unaffected
- [x] 3.2 Verify `bun run check`/`lint`/`test` all pass
