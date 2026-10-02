# Design references

Screens generated with Google Stitch for the UI audit (milestone "UI audit
2026-10"). They are a reference for tickets, not a spec. Stitch output isn't
pixel-exact and it invents content, listed below. The acceptance criteria on
each ticket say what must be true.

- Stitch project: "Movie Planner Web – UI audit"
  (`projects/15225473948953947348`)
- Screen: "Movie Planner - Viewings"
  (`screens/0cc3f1cf76bc4fedbc65904298c90ed0`)
- Prompt: the Viewings page with tabs, a filter bar, a compact table of seven
  viewings, and a "7 logged viewings" footer with a results-per-page select.
- Model: `GEMINI_3_5_FLASH_LITE`

| File                          | Used by                                       |
| ----------------------------- | --------------------------------------------- |
| `stitch-viewings-full.png`    | #679, #681                                    |
| `stitch-viewings-table.png`   | #679 (row density, time format, medium badge) |
| `stitch-activity-heatmap.png` | #681 (legend, fills the card)                 |

## Not part of the design

Stitch added things this app doesn't have. Ignore the "Overview Stats" card,
"Curated taste", the "CalDAV Connected / Synced 2m ago" status, the venue
names, the doubled "+ + Log a viewing" label and the four-row heatmap.
