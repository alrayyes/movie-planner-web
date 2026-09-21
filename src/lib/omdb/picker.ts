import { BUTTON_SECONDARY, FIELD_WRAPPER, INPUT, LABEL } from "../ui/classes";
import type { OmdbCandidate } from "./client";

export type PickerSort = "year" | "title";

// #628: a TV series' Year can be a range ("2016–2019") or open-ended
// ("2016–") rather than a single 4-digit value, and a candidate can have
// no Year at all — the first run of digits found is what actually orders
// it; none found sorts last rather than throwing.
function parsedYear(year: string | undefined): number | null {
  const match = year?.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

// #628: newest-first by default (a visitor picking a recent release
// shouldn't have to scan OMDb's own unsorted relevance order for it),
// with Title (A–Z) as the other option a visitor can switch to.
export function sortCandidates(candidates: OmdbCandidate[], sort: PickerSort): OmdbCandidate[] {
  const sorted = [...candidates];
  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }
  sorted.sort((a, b) => {
    const yearA = parsedYear(a.year);
    const yearB = parsedYear(b.year);
    if (yearA === null && yearB === null) return 0;
    if (yearA === null) return 1;
    if (yearB === null) return -1;
    return yearB - yearA;
  });
  return sorted;
}

function buildCandidateButton(
  candidate: OmdbCandidate,
  onSelect: (candidate: OmdbCandidate) => void,
): HTMLButtonElement {
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
  return button;
}

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
  // #579: "Continue without metadata" is accurate for the Refresh flow
  // (the default every other caller keeps), but reads as a forward action
  // rather than the only way back out of a manual search.
  dismissLabel = "Continue without metadata",
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

  let sort: PickerSort = "year";

  const list = document.createElement("div");
  // #623: OMDb search can now return up to 50 candidates (#622, up from
  // a max of 10) — a bounded, scrollable height keeps a large result set
  // from growing the containing dialog unboundedly, the same max-height/
  // overflow-y-auto pattern VenuePicker.svelte's own bulk-add checklist
  // already uses for an unbounded list.
  list.className = "flex max-h-96 flex-wrap gap-3 overflow-y-auto";

  function renderList() {
    list.replaceChildren(
      ...sortCandidates(candidates, sort).map((candidate) =>
        buildCandidateButton(candidate, onSelect),
      ),
    );
  }

  // #628: nothing to sort with a single result — the control would just
  // be a no-op distraction.
  if (candidates.length > 1) {
    const sortWrapper = document.createElement("label");
    sortWrapper.className = FIELD_WRAPPER;
    sortWrapper.setAttribute("for", "omdb-picker-sort");

    const sortLabelText = document.createElement("span");
    sortLabelText.className = LABEL;
    sortLabelText.textContent = "Sort by";
    sortWrapper.appendChild(sortLabelText);

    const sortSelect = document.createElement("select");
    sortSelect.id = "omdb-picker-sort";
    sortSelect.className = INPUT;

    const yearOption = document.createElement("option");
    yearOption.value = "year";
    yearOption.textContent = "Newest first";
    const titleOption = document.createElement("option");
    titleOption.value = "title";
    titleOption.textContent = "Title (A–Z)";
    sortSelect.append(yearOption, titleOption);

    sortSelect.addEventListener("change", () => {
      sort = sortSelect.value === "title" ? "title" : "year";
      renderList();
    });
    sortWrapper.appendChild(sortSelect);
    wrap.appendChild(sortWrapper);
  }

  renderList();
  wrap.appendChild(list);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = BUTTON_SECONDARY;
  dismiss.textContent = dismissLabel;
  dismiss.addEventListener("click", onDismiss);
  wrap.appendChild(dismiss);

  return wrap;
}
