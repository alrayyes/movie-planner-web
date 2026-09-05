import { deleteViewing, listViewings, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../lib/caldav/types";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
import { imdbUrl, letterboxdSearchUrl, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { buildOmdbPicker } from "../lib/omdb/picker";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  BUTTON_SM,
  FIELD_WRAPPER,
  INPUT,
  LABEL,
  STATUS_TEXT,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  TR_BODY,
} from "../lib/ui/classes";

// calendar-overview spec: the main screen — every logged viewing with full
// metadata, filterable by date range and medium, scoped to the visitor's
// own calendar (their own stored credentials are the only config this ever
// reads, so "whose data" falls out of the credentials capability rather
// than anything this element does itself). Also carries the
// movie-editing capability's update/delete controls, since both act on
// the same rows this screen already renders.
const DEFAULT_RANGE_MONTHS_BACK = 3;
const DEFAULT_RANGE_YEARS_FORWARD = 1;

// #37: OMDb-sourced fields (director/actors/ratings/genre/year/poster/
// imdbId) are deliberately not in this list — that's "foreign" data a
// visitor shouldn't hand-edit field by field. The Refresh control
// re-fetches it from OMDb instead of trusting a manual override that'd
// drift from what OMDb actually reports.
const EDITABLE_FIELDS: { key: keyof NewViewing; label: string; type: string }[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "start", label: "Start", type: "datetime-local" },
  { key: "end", label: "End", type: "datetime-local" },
  { key: "medium", label: "Medium", type: "text" },
  { key: "venue", label: "Venue", type: "text" },
];

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class CalendarOverview extends HTMLElement {
  private allViewings: LoggedViewing[] = [];
  private config: CaldavConfig | undefined;
  private omdbApiKey: string | undefined;
  private listContainer: HTMLElement | undefined;
  private statusEl: HTMLElement | undefined;
  private actionStatusEl: HTMLElement | undefined;
  private fromInput: HTMLInputElement | undefined;
  private toInput: HTMLInputElement | undefined;
  private mediumInput: HTMLInputElement | undefined;
  private editingUid: string | undefined;
  private pickerArea: HTMLElement | undefined;

  async connectedCallback() {
    const config = (this as unknown as { config?: CaldavConfig }).config;
    if (!config) {
      throw new Error(
        "<calendar-overview> requires a `config` property to be set before connecting",
      );
    }
    this.config = config;
    this.omdbApiKey = (this as unknown as { omdbApiKey?: string }).omdbApiKey;

    this.className = "flex flex-col gap-4";
    this.innerHTML = "";
    this.buildFilters();
    this.statusEl = document.createElement("p");
    this.statusEl.className = STATUS_TEXT;
    this.statusEl.setAttribute("role", "status");
    // Separate from statusEl (the result count, rewritten on every reload)
    // so a "Saved."/"Deleted." confirmation isn't clobbered the instant
    // the post-write reload runs — see the movie-editing tests for why
    // this used to disappear before anyone could read it.
    this.actionStatusEl = document.createElement("p");
    this.actionStatusEl.className = STATUS_TEXT;
    this.actionStatusEl.setAttribute("role", "status");
    // Only offered once an OMDb key is set, same as the per-row Refresh
    // control — nothing to refresh from without one.
    if (this.omdbApiKey) {
      const refreshAllButton = document.createElement("button");
      refreshAllButton.type = "button";
      refreshAllButton.className = BUTTON_SECONDARY;
      refreshAllButton.textContent = "Refresh all metadata";
      refreshAllButton.addEventListener("click", () => void this.handleRefreshAll());
      this.appendChild(refreshAllButton);
    }
    this.pickerArea = document.createElement("div");
    this.listContainer = document.createElement("div");
    this.append(this.statusEl, this.actionStatusEl, this.pickerArea, this.listContainer);

    await this.reload();
  }

  private buildFilters() {
    const form = document.createElement("form");
    form.className = "flex flex-wrap items-end gap-3";
    form.setAttribute("aria-label", "Filter logged viewings");

    const fromLabel = document.createElement("label");
    fromLabel.className = FIELD_WRAPPER;
    const fromText = document.createElement("span");
    fromText.className = LABEL;
    fromText.textContent = "From";
    this.fromInput = document.createElement("input");
    this.fromInput.className = INPUT;
    this.fromInput.type = "date";
    fromLabel.htmlFor = "overview-from";
    this.fromInput.id = "overview-from";
    fromLabel.append(fromText, this.fromInput);

    const toLabel = document.createElement("label");
    toLabel.className = FIELD_WRAPPER;
    const toText = document.createElement("span");
    toText.className = LABEL;
    toText.textContent = "To";
    this.toInput = document.createElement("input");
    this.toInput.className = INPUT;
    this.toInput.type = "date";
    toLabel.htmlFor = "overview-to";
    this.toInput.id = "overview-to";
    toLabel.append(toText, this.toInput);

    const mediumLabel = document.createElement("label");
    mediumLabel.className = FIELD_WRAPPER;
    const mediumText = document.createElement("span");
    mediumText.className = LABEL;
    mediumText.textContent = "Medium";
    this.mediumInput = document.createElement("input");
    this.mediumInput.className = INPUT;
    this.mediumInput.type = "text";
    this.mediumInput.placeholder = "e.g. cinema";
    mediumLabel.htmlFor = "overview-medium";
    this.mediumInput.id = "overview-medium";
    mediumLabel.append(mediumText, this.mediumInput);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = BUTTON_PRIMARY;
    submit.textContent = "Filter";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = BUTTON_SECONDARY;
    clear.textContent = "Clear filter";
    clear.addEventListener("click", () => {
      form.reset();
      void this.reload();
    });

    form.append(fromLabel, toLabel, mediumLabel, submit, clear);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.reload();
    });

    this.appendChild(form);
  }

  private currentRange() {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setMonth(now.getMonth() - DEFAULT_RANGE_MONTHS_BACK);
    const defaultTo = new Date(now);
    defaultTo.setFullYear(now.getFullYear() + DEFAULT_RANGE_YEARS_FORWARD);

    const from = this.fromInput?.value ? new Date(this.fromInput.value) : defaultFrom;
    const to = this.toInput?.value ? new Date(this.toInput.value) : defaultTo;
    return { from: from.toISOString(), to: to.toISOString() };
  }

  private async reload() {
    if (!this.config || !this.statusEl) return;
    this.statusEl.textContent = "Loading…";
    try {
      this.allViewings = await listViewings(this.config, this.currentRange());
      this.render();
    } catch (error) {
      this.statusEl.textContent =
        error instanceof Error ? error.message : "Failed to load viewings.";
    }
  }

  // Shared by render() and handleRefreshAll(), so "refresh all" always acts
  // on exactly what's currently on screen, not the unfiltered/unsorted
  // full set.
  private currentlyDisplayed(): LoggedViewing[] {
    const mediumFilter = this.mediumInput?.value.trim().toLowerCase();
    const filtered = mediumFilter
      ? this.allViewings.filter((v) => v.medium.toLowerCase() === mediumFilter)
      : this.allViewings;
    // Most recently watched first — a plain string-date fallback isn't
    // enough here since a filtered subset can be re-sorted after every
    // reload, so this always sorts fresh rather than relying on
    // insertion order from the CalDAV response.
    return [...filtered].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  }

  private render() {
    if (!this.listContainer || !this.statusEl) return;

    const viewings = this.currentlyDisplayed();

    this.statusEl.textContent = `${viewings.length} logged viewing${viewings.length === 1 ? "" : "s"}.`;
    this.listContainer.innerHTML = "";

    if (viewings.length === 0) return;

    const wrap = document.createElement("div");
    wrap.className = TABLE_WRAP;
    const table = document.createElement("table");
    table.className = TABLE;
    const thead = document.createElement("thead");
    thead.className = "bg-slate-50 dark:bg-slate-900/40";
    const headerRow = document.createElement("tr");
    for (const heading of ["Poster", "Title", "Start", "End", "Medium", "Venue", "Actions"]) {
      const th = document.createElement("th");
      th.className = TH;
      th.scope = "col";
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    tbody.className = "divide-y divide-slate-200 dark:divide-slate-700";
    for (const viewing of viewings) {
      tbody.appendChild(
        viewing.uid === this.editingUid ? this.renderEditRow(viewing) : this.renderRow(viewing),
      );
    }

    table.append(thead, tbody);
    wrap.appendChild(table);
    this.listContainer.appendChild(wrap);
  }

  private renderRow(viewing: LoggedViewing): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.className = TR_BODY;

    const posterCell = document.createElement("td");
    posterCell.className = TD;
    if (viewing.posterUrl) {
      const img = document.createElement("img");
      img.src = viewing.posterUrl;
      img.alt = `${viewing.title} poster`;
      // #64: a UX audit flagged the previous h-16 (64px) thumbnail as too
      // small to recognize a poster by — this is double that.
      img.className = "h-32 w-auto rounded shadow-sm";
      img.loading = "lazy";
      posterCell.appendChild(img);
    }
    row.appendChild(posterCell);

    const titleCell = document.createElement("td");
    titleCell.className = TD;
    // #38: the details page — a query-string ?uid=, not a dynamic
    // /movie/[uid] route, since this build is fully static (no
    // getStaticPaths could ever know a visitor's own private CalDAV
    // UIDs at build time).
    const titleLine = document.createElement("a");
    titleLine.href = `/movie?uid=${encodeURIComponent(viewing.uid)}`;
    titleLine.className = "font-medium text-indigo-600 hover:underline dark:text-indigo-400";
    titleLine.textContent = viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title;
    titleCell.appendChild(titleLine);
    const links = [
      viewing.imdbId && { label: "IMDb", href: imdbUrl(viewing.imdbId) },
      { label: "RT", href: rottenTomatoesSearchUrl(viewing.title) },
      { label: "Letterboxd", href: letterboxdSearchUrl(viewing.title) },
    ].filter((l): l is { label: string; href: string } => Boolean(l));
    if (links.length > 0) {
      const linkRow = document.createElement("div");
      linkRow.className = "mt-1 flex gap-2 text-xs";
      for (const { label, href } of links) {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "text-indigo-600 hover:underline dark:text-indigo-400";
        a.textContent = label;
        linkRow.appendChild(a);
      }
      titleCell.appendChild(linkRow);
    }
    row.appendChild(titleCell);

    // Director/actors/genre/ratings live on the details page (#38, one
    // click away via the title link) rather than as their own columns
    // here — keeping this table to a fixed, narrow column count is what
    // lets it fit a phone screen without horizontal scroll.
    for (const value of [
      new Date(viewing.start).toLocaleString(),
      new Date(viewing.end).toLocaleString(),
      viewing.medium,
      viewing.venue ?? "",
    ]) {
      const td = document.createElement("td");
      td.className = TD;
      td.textContent = value;
      row.appendChild(td);
    }

    const actions = document.createElement("td");
    actions.className = `${TD} flex gap-2`;
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = BUTTON_SM;
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      this.editingUid = viewing.uid;
      this.render();
    });
    actions.appendChild(editButton);

    // #37: only offered once an OMDb key is set, matching the
    // best-effort/optional-key behaviour everywhere else this app calls
    // OMDb — there's nothing to refresh from without one.
    if (this.omdbApiKey) {
      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.className = BUTTON_SM;
      refreshButton.textContent = "Refresh metadata";
      refreshButton.addEventListener("click", () => void this.handleRefresh(viewing));
      actions.appendChild(refreshButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = `${BUTTON_SM} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`;
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      void this.handleDelete(viewing);
    });
    actions.appendChild(deleteButton);

    row.appendChild(actions);
    return row;
  }

  private renderEditRow(viewing: LoggedViewing): HTMLTableRowElement {
    const row = document.createElement("tr");
    const inputs = new Map<keyof NewViewing, HTMLInputElement>();

    // One combined edit cell rather than one input per original column —
    // "edit any field" covers fields (director/actors/ratings) the
    // read-only row layout has no column-per-field mapping for anyway.
    const editCell = document.createElement("td");
    editCell.className = `${TD} bg-slate-50 dark:bg-slate-900/40`;
    editCell.colSpan = 7;
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
    editCell.appendChild(grid);
    for (const field of EDITABLE_FIELDS) {
      const wrapper = document.createElement("div");
      wrapper.className = FIELD_WRAPPER;
      const label = document.createElement("label");
      label.className = LABEL;
      const id = `edit-${viewing.uid}-${field.key}`;
      label.htmlFor = id;
      label.textContent = field.label;
      const input = document.createElement("input");
      input.className = INPUT;
      input.id = id;
      input.type = field.type;
      const value = viewing[field.key];
      input.value =
        (field.type === "datetime-local" ? toDatetimeLocal(String(value)) : value) ?? "";
      wrapper.append(label, input);
      grid.appendChild(wrapper);
      inputs.set(field.key, input);
    }

    const buttonRow = document.createElement("div");
    buttonRow.className = "mt-4 flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-700";
    editCell.appendChild(buttonRow);
    row.appendChild(editCell);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = BUTTON_PRIMARY;
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      if (!this.config || !this.actionStatusEl) return;
      // Only the editable fields come from the form — everything else
      // (OMDb-sourced metadata, the booking ref) carries over from the
      // viewing as it already was, since none of it has an input here
      // to have changed.
      const updated: NewViewing = {
        ...viewing,
        title: inputs.get("title")?.value ?? "",
        start: new Date(inputs.get("start")?.value ?? "").toISOString(),
        end: new Date(inputs.get("end")?.value ?? "").toISOString(),
        medium: inputs.get("medium")?.value ?? "",
        venue: inputs.get("venue")?.value || undefined,
      };
      try {
        await updateViewing(this.config, viewing.uid, updated);
        this.editingUid = undefined;
        await this.reload();
        this.actionStatusEl.textContent = "Saved.";
      } catch (error) {
        this.actionStatusEl.textContent =
          error instanceof Error ? error.message : "Failed to save.";
      }
    });

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = BUTTON_SECONDARY;
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      this.editingUid = undefined;
      this.render();
    });

    buttonRow.append(saveButton, cancelButton);
    return row;
  }

  // #37: re-runs the best-effort OMDb lookup against the viewing's
  // stored title and overwrites the stored director/actors/ratings/
  // genre/year/poster/imdbId with the new result — the corrective
  // action for stale or since-updated OMDb data, now that those fields
  // aren't hand-editable (see EDITABLE_FIELDS's own comment).
  private async handleRefresh(viewing: LoggedViewing) {
    if (!this.config || !this.omdbApiKey || !this.actionStatusEl) return;
    try {
      const metadata = await lookupMovie(
        this.omdbApiKey,
        viewing.title,
        new Date(viewing.start).getFullYear().toString(),
      );
      if (metadata) {
        await updateViewing(this.config, viewing.uid, { ...viewing, ...metadata });
        await this.reload();
        this.actionStatusEl.textContent = "Refreshed.";
        return;
      }
      // #49: no single confident match — offer a disambiguation picker
      // if OMDb's search has candidates, rather than reporting no match
      // outright.
      const candidates = await searchMovies(this.omdbApiKey, viewing.title);
      if (candidates.length > 0) {
        this.showOmdbPicker(viewing, candidates);
        return;
      }
      this.actionStatusEl.textContent = "OMDb had no match for this title.";
    } catch (error) {
      this.actionStatusEl.textContent =
        error instanceof Error ? error.message : "Failed to refresh metadata.";
    }
  }

  private showOmdbPicker(viewing: LoggedViewing, candidates: OmdbCandidate[]) {
    if (!this.pickerArea || !this.config || !this.omdbApiKey || !this.actionStatusEl) return;
    this.pickerArea.innerHTML = "";
    this.pickerArea.appendChild(
      buildOmdbPicker(
        candidates,
        async (candidate) => {
          if (!this.config || !this.omdbApiKey || !this.actionStatusEl || !this.pickerArea) return;
          try {
            const metadata = await lookupByImdbId(this.omdbApiKey, candidate.imdbId);
            if (metadata) {
              await updateViewing(this.config, viewing.uid, { ...viewing, ...metadata });
            }
            await this.reload();
            this.actionStatusEl.textContent = "Refreshed.";
          } catch (error) {
            this.actionStatusEl.textContent =
              error instanceof Error ? error.message : "Failed to attach the selected match.";
          } finally {
            this.pickerArea.innerHTML = "";
          }
        },
        () => {
          this.pickerArea?.replaceChildren();
          if (this.actionStatusEl)
            this.actionStatusEl.textContent = "OMDb had no match for this title.";
        },
      ),
    );
  }

  // Runs the same per-row refresh across every viewing currently on
  // screen (the filtered/sorted set, not the whole calendar) — sequential
  // rather than parallel, since it's hitting OMDb's own rate limits, not
  // just this app's.
  private async handleRefreshAll() {
    if (!this.config || !this.omdbApiKey || !this.actionStatusEl) return;
    const targets = this.currentlyDisplayed();
    if (targets.length === 0) return;

    this.actionStatusEl.textContent = `Refreshing 0 of ${targets.length}…`;
    let refreshed = 0;
    let misses = 0;
    for (const viewing of targets) {
      try {
        const metadata = await lookupMovie(
          this.omdbApiKey,
          viewing.title,
          new Date(viewing.start).getFullYear().toString(),
        );
        if (metadata) {
          await updateViewing(this.config, viewing.uid, { ...viewing, ...metadata });
          refreshed++;
        } else {
          misses++;
        }
      } catch {
        misses++;
      }
      this.actionStatusEl.textContent = `Refreshing ${refreshed + misses} of ${targets.length}…`;
    }

    await this.reload();
    this.actionStatusEl.textContent =
      misses > 0
        ? `Refreshed ${refreshed} of ${targets.length} (${misses} had no OMDb match or failed).`
        : `Refreshed ${refreshed} of ${targets.length}.`;
  }

  private async handleDelete(viewing: LoggedViewing) {
    if (!this.config || !this.actionStatusEl) return;
    // movie-editing spec, "Delete confirmation": a native confirm() dialog
    // is a real accessible modal (keyboard- and screen-reader-operable by
    // the browser itself), not a shortcut around building one.
    if (!window.confirm(`Delete "${viewing.title}"? This can't be undone.`)) return;

    try {
      await deleteViewing(this.config, viewing.uid);
      await this.reload();
      this.actionStatusEl.textContent = "Deleted.";
    } catch (error) {
      this.actionStatusEl.textContent =
        error instanceof Error ? error.message : "Failed to delete.";
    }
  }
}

customElements.define("calendar-overview", CalendarOverview);
