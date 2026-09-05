// Shared Tailwind class strings for the Web Components, which build DOM
// imperatively (design.md: vanilla TS, no frontend framework) rather than
// through Astro/JSX templates. One place for these keeps every form/table/
// button visually consistent without a component system to enforce it.
//
// Every colour here carries a dark: variant too — see global.css's
// @custom-variant and Layout.astro's toggle/init script for how `.dark`
// on <html> gets set. A class defined only for light mode is a class
// this app's dark mode silently doesn't cover.
export const FIELD_WRAPPER = "flex min-w-0 flex-col gap-1";
export const LABEL = "text-sm font-medium text-slate-700 dark:text-slate-300";
// text-base (16px), not text-sm — iOS Safari auto-zooms the whole page on
// focusing any input styled under 16px, and the resulting zoomed viewport
// is then pannable, which reads as "the page scrolls horizontally" even
// though there's no actual layout overflow (confirmed: neither Chromium
// nor Firefox show real overflow here — this is a Safari-only zoom
// behavior, not a layout bug, so it never shows up in either engine's
// scrollWidth/clientWidth). w-full since a bare <input> otherwise falls
// back to its own intrinsic ~20-character width instead of filling its
// flex container.
export const INPUT =
  "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400";

export const FORM = "flex flex-col gap-4";

export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus:ring-offset-slate-900";
export const BUTTON_SECONDARY =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900";
export const BUTTON_DANGER =
  "inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-500 dark:hover:bg-red-400 dark:focus:ring-offset-slate-900";
export const BUTTON_SM =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900";

export const STATUS_TEXT = "text-sm text-slate-600 dark:text-slate-400";

export const NAV =
  "mb-6 flex flex-wrap items-center gap-4 border-b border-slate-200 pb-4 dark:border-slate-700";
export const NAV_LINK =
  "text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400";

export const SECTION_HEADING = "text-base font-semibold text-slate-900 dark:text-slate-100";

export const TABLE_WRAP =
  "overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700";
export const TABLE = "min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700";
// #93/#217: px-2 not px-3 below the sm breakpoint — a real, ordinary row
// (nothing pathological, just a title/date/venue of normal length) on
// a real phone-width viewport still needed its own table wider than
// its overview column count could fit in ~307px of available width,
// forcing the table's own overflow-x-auto wrapper to scroll — every
// px of padding across 5 columns adds up fast at that width.
export const TH = "px-2 py-2 text-left font-semibold text-slate-700 sm:px-3 dark:text-slate-300";
export const TD = "px-2 py-2 align-top text-slate-700 sm:px-3 dark:text-slate-300";
export const TR_BODY = "even:bg-slate-50 dark:even:bg-slate-800/60";

export const DL = "grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm";
export const DT = "font-medium text-slate-500 dark:text-slate-400";
export const DD = "text-slate-900 dark:text-slate-100";
