import { listViewings } from "../lib/caldav/api-client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";

// calendar-overview spec: the main screen — every logged viewing with full
// metadata, filterable by date range and medium, scoped to the visitor's
// own calendar (their own stored credentials are the only config this ever
// reads, so "whose data" falls out of the credentials capability rather
// than anything this element does itself).
const DEFAULT_RANGE_YEARS_BACK = 10;
const DEFAULT_RANGE_YEARS_FORWARD = 1;

export class CalendarOverview extends HTMLElement {
  private allViewings: LoggedViewing[] = [];
  private config: CaldavConfig | undefined;
  private listContainer: HTMLElement | undefined;
  private statusEl: HTMLElement | undefined;
  private fromInput: HTMLInputElement | undefined;
  private toInput: HTMLInputElement | undefined;
  private mediumInput: HTMLInputElement | undefined;

  async connectedCallback() {
    const config = (this as unknown as { config?: CaldavConfig }).config;
    if (!config) {
      throw new Error(
        "<calendar-overview> requires a `config` property to be set before connecting",
      );
    }
    this.config = config;

    this.innerHTML = "";
    this.buildFilters();
    this.statusEl = document.createElement("p");
    this.statusEl.setAttribute("role", "status");
    this.listContainer = document.createElement("div");
    this.append(this.statusEl, this.listContainer);

    await this.reload();
  }

  private buildFilters() {
    const form = document.createElement("form");
    form.setAttribute("aria-label", "Filter logged viewings");

    const fromLabel = document.createElement("label");
    fromLabel.textContent = "From";
    this.fromInput = document.createElement("input");
    this.fromInput.type = "date";
    fromLabel.htmlFor = "overview-from";
    this.fromInput.id = "overview-from";
    fromLabel.appendChild(this.fromInput);

    const toLabel = document.createElement("label");
    toLabel.textContent = "To";
    this.toInput = document.createElement("input");
    this.toInput.type = "date";
    toLabel.htmlFor = "overview-to";
    this.toInput.id = "overview-to";
    toLabel.appendChild(this.toInput);

    const mediumLabel = document.createElement("label");
    mediumLabel.textContent = "Medium";
    this.mediumInput = document.createElement("input");
    this.mediumInput.type = "text";
    this.mediumInput.placeholder = "e.g. cinema";
    mediumLabel.htmlFor = "overview-medium";
    this.mediumInput.id = "overview-medium";
    mediumLabel.appendChild(this.mediumInput);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Filter";

    form.append(fromLabel, toLabel, mediumLabel, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.reload();
    });

    this.appendChild(form);
  }

  private currentRange() {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setFullYear(now.getFullYear() - DEFAULT_RANGE_YEARS_BACK);
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
    const viewings = mediumFilter
      ? this.allViewings.filter((v) => v.medium.toLowerCase() === mediumFilter)
      : this.allViewings;

    this.statusEl.textContent = `${viewings.length} logged viewing${viewings.length === 1 ? "" : "s"}.`;
    this.listContainer.innerHTML = "";

    if (viewings.length === 0) return;

    const table = document.createElement("table");
    const thead = document.createElement("thead");
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
    ]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    for (const viewing of viewings) {
      const row = document.createElement("tr");
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
        td.textContent = value;
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }

    table.append(thead, tbody);
    this.listContainer.appendChild(table);
  }
}

customElements.define("calendar-overview", CalendarOverview);
