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

| File                          | Used for                               |
| ----------------------------- | -------------------------------------- |
| `stitch-viewings-full.png`    | The whole Viewings page                |
| `stitch-viewings-table.png`   | Row density, time format, medium badge |
| `stitch-activity-heatmap.png` | The heatmap's legend, fills the card   |

## Calendar screens

Two more screens from the same project, for the calendar tickets #911, #912
and #913.

- Desktop: "Movie Planner - Calendar (Weekday Focus & Habits)"
  (`screens/afc36a1c478c406393ce788e48e8a83d`)
- Mobile: "Movie Planner - Calendar Mobile (Agenda & Weekday Punch Card)"
  (`screens/1f7dbb93948d4a9b8adf2e5e1d3c0afb`)

| File                          | Used for                               |
| ----------------------------- | -------------------------------------- |
| `stitch-calendar-desktop.png` | The whole desktop screen               |
| `stitch-calendar-grid.png`    | Weekday header and weekend tint (#911) |
| `stitch-calendar-habits.png`  | The weekday habits card (#912)         |
| `stitch-calendar-mobile.png`  | The agenda on a phone (#913)           |

Not part of this design: the month grid itself (ours is a year heatmap), the
"Immediate Screenings" and "CalDAV Calendars" cards, the format highlight, the
Month/Week/Stats tabs, and the editorial tags "Peak Night", "Cheap ticket
night" and "Late revival", which the app can't know.

## Not part of the design

Stitch added things this app doesn't have. Ignore the "Overview Stats" card,
"Curated taste", the "CalDAV Connected / Synced 2m ago" status, the venue
names, the doubled "+ + Log a viewing" label and the four-row heatmap.
