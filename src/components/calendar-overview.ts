import { deleteViewing, listViewings, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../lib/caldav/types";
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

const EDITABLE_FIELDS: { key: keyof NewViewing; label: string; type: string }[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "start", label: "Start", type: "datetime-local" },
  { key: "end", label: "End", type: "datetime-local" },
  { key: "medium", label: "Medium", type: "text" },
  { key: "venue", label: "Venue", type: "text" },
  { key: "director", label: "Director", type: "text" },
  { key: "actors", label: "Actors", type: "text" },
  { key: "ratingImdb", label: "IMDb rating", type: "text" },
  { key: "ratingRottenTomatoes", label: "Rotten Tomatoes rating", type: "text" },
  { key: "ratingMetacritic", label: "Metacritic rating", type: "text" },
];

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class CalendarOverview extends HTMLElement {
  private allViewings: LoggedViewing[] = [];
  private config: CaldavConfig | undefined;
  private listContainer: HTMLElement | undefined;
  private statusEl: HTMLElement | undefined;
  private actionStatusEl: HTMLElement | undefined;
  private fromInput: HTMLInputElement | undefined;
  private toInput: HTMLInputElement | undefined;
  private mediumInput: HTMLInputElement | undefined;
  private editingUid: string | undefined;

  async connectedCallback() {
    const config = (this as unknown as { config?: CaldavConfig }).config;
    if (!config) {
      throw new Error(
        "<calendar-overview> requires a `config` property to be set before connecting",
      );
    }
    this.config = config;

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
    this.listContainer = document.createElement("div");
    this.append(this.statusEl, this.actionStatusEl, this.listContainer);

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

  private render() {
    if (!this.listContainer || !this.statusEl) return;

    const mediumFilter = this.mediumInput?.value.trim().toLowerCase();
    const filtered = mediumFilter
      ? this.allViewings.filter((v) => v.medium.toLowerCase() === mediumFilter)
      : this.allViewings;
    // Most recently watched first — a plain string-date fallback isn't
    // enough here since a filtered subset can be re-sorted after every
    // reload, so this always sorts fresh rather than relying on
    // insertion order from the CalDAV response.
    const viewings = [...filtered].sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
    );

    this.statusEl.textContent = `${viewings.length} logged viewing${viewings.length === 1 ? "" : "s"}.`;
    this.listContainer.innerHTML = "";

    if (viewings.length === 0) return;

    const wrap = document.createElement("div");
    wrap.className = TABLE_WRAP;
    const table = document.createElement("table");
    table.className = TABLE;
    const thead = document.createElement("thead");
    thead.className = "bg-slate-50";
    const headerRow = document.createElement("tr");
    for (const heading of [
      "Title",
      "Start",
      "End",
      "Medium",
      "Venue",
      "Director",
      "Actors",
      "Ratings",
      "Actions",
    ]) {
      const th = document.createElement("th");
      th.className = TH;
      th.scope = "col";
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    tbody.className = "divide-y divide-slate-200";
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
    const ratings = [
      viewing.ratingImdb && `IMDb ${viewing.ratingImdb}`,
      viewing.ratingRottenTomatoes && `RT ${viewing.ratingRottenTomatoes}`,
      viewing.ratingMetacritic && `Metacritic ${viewing.ratingMetacritic}`,
    ]
      .filter(Boolean)
      .join(", ");
    for (const value of [
      viewing.title,
      new Date(viewing.start).toLocaleString(),
      new Date(viewing.end).toLocaleString(),
      viewing.medium,
      viewing.venue ?? "",
      viewing.director ?? "",
      viewing.actors ?? "",
      ratings,
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

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = `${BUTTON_SM} text-red-700 hover:bg-red-50`;
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      void this.handleDelete(viewing);
    });

    actions.append(editButton, deleteButton);
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
    editCell.className = `${TD} bg-slate-50`;
    editCell.colSpan = 9;
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
    buttonRow.className = "mt-4 flex gap-2 border-t border-slate-200 pt-4";
    editCell.appendChild(buttonRow);
    row.appendChild(editCell);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = BUTTON_PRIMARY;
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      if (!this.config || !this.actionStatusEl) return;
      const updated: NewViewing = {
        title: inputs.get("title")?.value ?? "",
        start: new Date(inputs.get("start")?.value ?? "").toISOString(),
        end: new Date(inputs.get("end")?.value ?? "").toISOString(),
        medium: inputs.get("medium")?.value ?? "",
        venue: inputs.get("venue")?.value || undefined,
        director: inputs.get("director")?.value || undefined,
        actors: inputs.get("actors")?.value || undefined,
        ratingImdb: inputs.get("ratingImdb")?.value || undefined,
        ratingRottenTomatoes: inputs.get("ratingRottenTomatoes")?.value || undefined,
        ratingMetacritic: inputs.get("ratingMetacritic")?.value || undefined,
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
