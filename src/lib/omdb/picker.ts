import { BUTTON_SECONDARY } from "../ui/classes";
import type { OmdbCandidate } from "./client";

// #49: shared by the log form and both refresh controls (calendar-overview,
// movie-details) so a visitor sees the same picker regardless of which
// flow triggered it. A plain DOM-building function rather than a custom
// element, matching this codebase's existing pattern for reusable pieces
// that aren't their own screen (buildCredentialsForm in
// credentials-gate.ts is the precedent) — each caller owns where the
// result gets mounted and torn down.
export function buildOmdbPicker(
  candidates: OmdbCandidate[],
  onSelect: (candidate: OmdbCandidate) => void,
  onDismiss: () => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className =
    "flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40";
  wrap.setAttribute("aria-label", "Choose the matching title");

  const intro = document.createElement("p");
  intro.className = "text-sm text-slate-700 dark:text-slate-300";
  intro.textContent =
    "OMDb didn't find a single confident match. Pick the right one, or continue without metadata:";
  wrap.appendChild(intro);

  const list = document.createElement("div");
  list.className = "flex flex-wrap gap-3";
  for (const candidate of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "flex w-32 flex-col items-center gap-1 rounded-lg border border-slate-200 p-2 text-center text-xs text-slate-700 hover:border-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400";
    const label = candidate.year ? `${candidate.title} (${candidate.year})` : candidate.title;
    button.setAttribute("aria-label", label);
    if (candidate.posterUrl) {
      const img = document.createElement("img");
      img.src = candidate.posterUrl;
      img.alt = `${candidate.title} poster`;
      img.className = "h-40 w-full rounded object-cover";
      button.appendChild(img);
    }
    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    button.addEventListener("click", () => onSelect(candidate));
    list.appendChild(button);
  }
  wrap.appendChild(list);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = BUTTON_SECONDARY;
  dismiss.textContent = "Continue without metadata";
  dismiss.addEventListener("click", onDismiss);
  wrap.appendChild(dismiss);

  return wrap;
}
