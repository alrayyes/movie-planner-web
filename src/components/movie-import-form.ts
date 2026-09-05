import type { LoggedViewing, NewViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { parseCsvImport, parseJsonImport } from "../lib/movie-log/import-rows";
import {
  applyImportUpdate,
  fetchExistingForImportCheck,
  type ImportPlanEntry,
  type ImportUpdateEntry,
  importRow,
  planImport,
  planUpdates,
} from "../lib/movie-log/run-import";
import {
  BUTTON_PRIMARY,
  LABEL,
  SECTION_HEADING,
  STATUS_TEXT,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  TR_BODY,
} from "../lib/ui/classes";

// bulk-import spec: CSV/JSON import with duplicate detection (against both
// the existing calendar and rows earlier in the same file), confirmed
// before writing a likely duplicate.
//
// #69: a row from the exported format whose uid matches an existing
// entry is an *update* to that entry instead — its own review section,
// with a checkbox per changed field rather than per row, since the
// calendar is the source of truth and a visitor should be able to
// accept a corrected rating while rejecting an unrelated changed title
// on the same row.
export class MovieImportForm extends HTMLElement {
  private credentials: Credentials | null | undefined;
  private statusEl: HTMLElement | undefined;
  private reviewContainer: HTMLElement | undefined;
  private plan: ImportPlanEntry[] = [];
  private updates: ImportUpdateEntry[] = [];
  private existingByUid = new Map<string, LoggedViewing>();
  private parseErrors: { rowNumber: number; error?: string }[] = [];

  async connectedCallback() {
    this.credentials = await getCredentialsStore().get();
    if (!this.credentials) {
      throw new Error("<movie-import-form> requires stored credentials");
    }

    this.className = "flex flex-col gap-4";
    this.innerHTML = "";
    this.statusEl = document.createElement("p");
    this.statusEl.className = STATUS_TEXT;
    this.statusEl.setAttribute("role", "status");
    this.reviewContainer = document.createElement("div");
    this.reviewContainer.className = "flex flex-col gap-6";

    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "flex flex-col gap-1";
    const label = document.createElement("label");
    label.className = LABEL;
    label.htmlFor = "import-file";
    label.textContent = "Choose a CSV or JSON export";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.className = "text-sm text-slate-600 dark:text-slate-400";
    fileInput.id = "import-file";
    fileInput.accept = ".csv,.json,text/csv,application/json";
    fileInput.addEventListener("change", () => void this.handleFileSelected(fileInput));
    fieldWrapper.append(label, fileInput);

    this.append(fieldWrapper, this.statusEl, this.reviewContainer);
  }

  private async handleFileSelected(fileInput: HTMLInputElement) {
    if (!this.credentials || !this.statusEl) return;
    const file = fileInput.files?.[0];
    if (!file) return;

    this.statusEl.textContent = "Reading and checking for duplicates…";
    const text = await file.text();
    const parsed = file.name.toLowerCase().endsWith(".json")
      ? parseJsonImport(text)
      : parseCsvImport(text);
    this.parseErrors = parsed.filter((r) => r.error);

    try {
      const existing = await fetchExistingForImportCheck(this.credentials);
      this.existingByUid = new Map(existing.map((v) => [v.uid, v]));
      this.plan = planImport(parsed, existing);
      this.updates = planUpdates(parsed, existing);
      this.renderReview();
      const parts = [`${this.plan.length} new row(s)`];
      if (this.updates.length > 0) parts.push(`${this.updates.length} existing entry update(s)`);
      if (this.parseErrors.length > 0) parts.push(`${this.parseErrors.length} failed to parse`);
      this.statusEl.textContent = `${parts.join(", ")} ready to review.`;
    } catch (error) {
      this.statusEl.textContent =
        error instanceof Error ? error.message : "Failed to check for duplicates.";
    }
  }

  private renderReview() {
    if (!this.reviewContainer) return;
    this.reviewContainer.innerHTML = "";

    if (this.parseErrors.length > 0) {
      const errorList = document.createElement("ul");
      errorList.className = "list-inside list-disc text-sm text-red-700 dark:text-red-400";
      for (const { rowNumber, error } of this.parseErrors) {
        const li = document.createElement("li");
        li.textContent = `Row ${rowNumber}: ${error}`;
        errorList.appendChild(li);
      }
      this.reviewContainer.appendChild(errorList);
    }

    const createCheckboxes = this.renderCreateTable();
    const updateCheckboxes = this.renderUpdateSection();

    if (this.plan.length === 0 && this.updates.length === 0) return;

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = `${BUTTON_PRIMARY} self-start`;
    importButton.textContent = "Import checked rows";
    importButton.addEventListener(
      "click",
      () => void this.runImport(createCheckboxes, updateCheckboxes),
    );
    this.reviewContainer.appendChild(importButton);
  }

  private renderCreateTable(): Map<number, HTMLInputElement> {
    const checkboxes = new Map<number, HTMLInputElement>();
    if (!this.reviewContainer || this.plan.length === 0) return checkboxes;

    const wrap = document.createElement("div");
    wrap.className = TABLE_WRAP;
    const table = document.createElement("table");
    table.className = TABLE;
    const thead = document.createElement("thead");
    thead.className = "bg-slate-50 dark:bg-slate-900/40";
    const headerRow = document.createElement("tr");
    for (const heading of ["Include", "Title", "Date", "Medium", "Duplicate of"]) {
      const th = document.createElement("th");
      th.className = TH;
      th.scope = "col";
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    tbody.className = "divide-y divide-slate-200 dark:divide-slate-700";
    for (const entry of this.plan) {
      const row = document.createElement("tr");
      row.className = TR_BODY;

      const includeCell = document.createElement("td");
      includeCell.className = `${TD} flex items-center gap-2`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className =
        "size-4 rounded border-slate-300 text-indigo-600 dark:border-slate-600 dark:bg-slate-800";
      checkbox.id = `import-include-${entry.rowNumber}`;
      // bulk-import spec: a likely duplicate needs explicit confirmation —
      // starts unchecked, unlike every non-duplicate row.
      checkbox.checked = !entry.isDuplicate;
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "text-sm text-slate-700 dark:text-slate-300";
      checkboxLabel.htmlFor = checkbox.id;
      checkboxLabel.textContent = entry.isDuplicate ? "Import anyway" : "Import";
      includeCell.append(checkbox, checkboxLabel);
      checkboxes.set(entry.rowNumber, checkbox);

      row.append(includeCell);
      for (const value of [
        entry.row.title,
        entry.row.date,
        entry.row.medium,
        entry.duplicateOfTitle ?? "",
      ]) {
        const td = document.createElement("td");
        td.className = TD;
        td.textContent = value;
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.append(thead, tbody);
    wrap.appendChild(table);
    this.reviewContainer.appendChild(wrap);
    return checkboxes;
  }

  // #69: one block per uid-matched entry, one checkbox per changed
  // field (not per row) — old value → new value, so a visitor can
  // approve exactly what they want written to that existing CalDAV
  // event before anything touches the calendar.
  private renderUpdateSection(): Map<string, HTMLInputElement> {
    const checkboxes = new Map<string, HTMLInputElement>();
    if (!this.reviewContainer || this.updates.length === 0) return checkboxes;

    const section = document.createElement("section");
    section.className = "flex flex-col gap-4";
    const heading = document.createElement("h2");
    heading.className = SECTION_HEADING;
    heading.textContent = "Updates to existing entries";
    section.appendChild(heading);

    for (const entry of this.updates) {
      const block = document.createElement("div");
      block.className =
        "flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700";
      block.setAttribute("aria-label", `Changes for ${entry.title}`);
      const title = document.createElement("p");
      title.className = "text-sm font-medium text-slate-900 dark:text-slate-100";
      title.textContent = entry.title;
      block.appendChild(title);

      for (const change of entry.changes) {
        const row = document.createElement("label");
        row.className = "flex items-start gap-2 text-sm";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className =
          "mt-0.5 size-4 rounded border-slate-300 text-indigo-600 dark:border-slate-600 dark:bg-slate-800";
        checkbox.checked = true;
        const key = `${entry.rowNumber}:${change.field}`;
        checkboxes.set(key, checkbox);
        const text = document.createElement("span");
        text.className = "text-slate-700 dark:text-slate-300";
        text.textContent = `${change.label}: ${change.oldValue ?? "(none)"} → ${change.newValue}`;
        row.append(checkbox, text);
        block.appendChild(row);
      }
      section.appendChild(block);
    }
    this.reviewContainer.appendChild(section);
    return checkboxes;
  }

  private async runImport(
    createCheckboxes: Map<number, HTMLInputElement>,
    updateCheckboxes: Map<string, HTMLInputElement>,
  ) {
    if (!this.credentials || !this.statusEl) return;
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of this.plan) {
      if (!createCheckboxes.get(entry.rowNumber)?.checked) {
        skipped++;
        continue;
      }
      try {
        await importRow(this.credentials, entry.row);
        imported++;
      } catch {
        failed++;
      }
    }

    let updated = 0;
    for (const entry of this.updates) {
      const current = this.existingByUid.get(entry.uid);
      if (!current) {
        failed++;
        continue;
      }
      const approvedFields = new Set(
        entry.changes
          .filter((change) => updateCheckboxes.get(`${entry.rowNumber}:${change.field}`)?.checked)
          .map((change) => change.field),
      ) as Set<keyof NewViewing>;
      if (approvedFields.size === 0) {
        skipped++;
        continue;
      }
      try {
        await applyImportUpdate(this.credentials, current, entry, approvedFields);
        updated++;
      } catch {
        failed++;
      }
    }

    const parts = [`Imported ${imported}`];
    if (this.updates.length > 0) parts.push(`updated ${updated}`);
    parts.push(`skipped ${skipped}`, `failed ${failed}`);
    this.statusEl.textContent = `${parts.join(", ")}.`;
    this.reviewContainer?.replaceChildren();
    this.plan = [];
    this.updates = [];
  }
}

customElements.define("movie-import-form", MovieImportForm);
