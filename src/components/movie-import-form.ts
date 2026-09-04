import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { parseCsvImport, parseJsonImport } from "../lib/movie-log/import-rows";
import {
  fetchExistingForImportCheck,
  type ImportPlanEntry,
  importRow,
  planImport,
} from "../lib/movie-log/run-import";

// bulk-import spec: CSV/JSON import with duplicate detection (against both
// the existing calendar and rows earlier in the same file), confirmed
// before writing a likely duplicate.
export class MovieImportForm extends HTMLElement {
  private credentials: Credentials | null | undefined;
  private statusEl: HTMLElement | undefined;
  private reviewContainer: HTMLElement | undefined;
  private plan: ImportPlanEntry[] = [];
  private parseErrors: { rowNumber: number; error?: string }[] = [];

  async connectedCallback() {
    this.credentials = await getCredentialsStore().get();
    if (!this.credentials) {
      throw new Error("<movie-import-form> requires stored credentials");
    }

    this.innerHTML = "";
    this.statusEl = document.createElement("p");
    this.statusEl.setAttribute("role", "status");
    this.reviewContainer = document.createElement("div");

    const label = document.createElement("label");
    label.htmlFor = "import-file";
    label.textContent = "Choose a CSV or JSON export";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "import-file";
    fileInput.accept = ".csv,.json,text/csv,application/json";
    fileInput.addEventListener("change", () => void this.handleFileSelected(fileInput));

    this.append(label, fileInput, this.statusEl, this.reviewContainer);
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
      this.plan = planImport(parsed, existing);
      this.renderReview();
      this.statusEl.textContent = `${this.plan.length} row(s) ready to review${this.parseErrors.length ? `, ${this.parseErrors.length} failed to parse` : ""}.`;
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
      for (const { rowNumber, error } of this.parseErrors) {
        const li = document.createElement("li");
        li.textContent = `Row ${rowNumber}: ${error}`;
        errorList.appendChild(li);
      }
      this.reviewContainer.appendChild(errorList);
    }

    if (this.plan.length === 0) return;

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const heading of ["Include", "Title", "Date", "Medium", "Duplicate of"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = heading;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    const checkboxes = new Map<number, HTMLInputElement>();
    for (const entry of this.plan) {
      const row = document.createElement("tr");

      const includeCell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `import-include-${entry.rowNumber}`;
      // bulk-import spec: a likely duplicate needs explicit confirmation —
      // starts unchecked, unlike every non-duplicate row.
      checkbox.checked = !entry.isDuplicate;
      const checkboxLabel = document.createElement("label");
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
        td.textContent = value;
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.append(thead, tbody);

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.textContent = "Import checked rows";
    importButton.addEventListener("click", () => void this.runImport(checkboxes));

    this.reviewContainer.append(table, importButton);
  }

  private async runImport(checkboxes: Map<number, HTMLInputElement>) {
    if (!this.credentials || !this.statusEl) return;
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of this.plan) {
      if (!checkboxes.get(entry.rowNumber)?.checked) {
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

    this.statusEl.textContent = `Imported ${imported}, skipped ${skipped}, failed ${failed}.`;
    this.reviewContainer?.replaceChildren();
    this.plan = [];
  }
}

customElements.define("movie-import-form", MovieImportForm);
