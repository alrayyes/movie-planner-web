import type { LoggedViewing, NewViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";

import { executeImport, type ImportBatch } from "../lib/movie-log/execute-import";
import { SAMPLE_CSV, validateImportFile } from "../lib/movie-log/import-file";
import { parseCsvImport, parseJsonImport } from "../lib/movie-log/import-rows";
import {
  fetchExistingForImportCheck,
  type ImportPlanEntry,
  type ImportUpdateEntry,
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
    this.className = "flex flex-col gap-4";
    this.innerHTML = "";
    // #843: say which calendar rows will be written to, or that there isn't
    // one yet. Never the password.
    if (!this.credentials) {
      const warning = document.createElement("p");
      warning.setAttribute("role", "alert");
      warning.className =
        "rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200";
      warning.append(
        "No calendar is connected, so there's nowhere to import to. ",
        Object.assign(document.createElement("a"), {
          href: "/",
          className: "font-medium underline",
          textContent: "Connect your CalDAV calendar",
        }),
        " first.",
      );
      this.append(warning);
      return;
    }
    const target = document.createElement("p");
    target.className =
      "rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
    target.append("Importing into ");
    const url = document.createElement("strong");
    url.className = "break-all font-medium";
    url.textContent = this.credentials.caldavUrl;
    target.append(url, ` as ${this.credentials.caldavUsername}.`);
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
    // text-base (16px), not text-sm — same iOS Safari auto-zoom-on-focus
    // reasoning as INPUT in classes.ts (responsive.spec.ts's own
    // assertInputFontSizeAtLeast16px check, which #436's direct
    // page.goto("/import") — replacing a nav-link click now that Import
    // sits behind Settings — started actually reaching this element).
    fileInput.className = "text-base text-slate-600 dark:text-slate-400";
    fileInput.id = "import-file";
    fileInput.accept = ".csv,.json,text/csv,application/json";
    fileInput.addEventListener("change", () => void this.handleFileSelected(fileInput));
    // #843: the native input stays the keyboard and screen-reader path; the
    // dashed box around it only adds drag and drop for a pointer.
    const dropzone = document.createElement("div");
    dropzone.className =
      "flex flex-col gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 transition-colors dark:border-slate-600";
    const hint = document.createElement("p");
    hint.className = STATUS_TEXT;
    hint.textContent = "Drop a file here, or choose one. CSV or JSON, up to 25 MB.";
    const sample = document.createElement("a");
    sample.className = "text-sm font-medium text-indigo-600 underline dark:text-indigo-400";
    sample.href = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;
    sample.download = "movie-planner-sample.csv";
    sample.textContent = "Download a sample CSV";
    dropzone.append(label, fileInput, hint, sample);
    const highlight = (on: boolean) => {
      dropzone.classList.toggle("border-indigo-500", on);
      dropzone.classList.toggle("bg-indigo-50", on);
    };
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      highlight(true);
    });
    dropzone.addEventListener("dragleave", () => highlight(false));
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      highlight(false);
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      fileInput.files = files;
      fileInput.dispatchEvent(new Event("change"));
    });
    fieldWrapper.append(dropzone);

    this.append(target, fieldWrapper, this.statusEl, this.reviewContainer);
  }

  private async handleFileSelected(fileInput: HTMLInputElement) {
    if (!this.credentials || !this.statusEl) return;
    const file = fileInput.files?.[0];
    if (!file) return;
    const check = validateImportFile(file);
    if (!check.ok) {
      this.statusEl.textContent = check.error;
      this.reviewContainer?.replaceChildren();
      fileInput.value = "";
      return;
    }

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
    const credentials = this.credentials;
    let skipped = 0;

    const creates = this.plan.filter((entry) => {
      const checked = createCheckboxes.get(entry.rowNumber)?.checked;
      if (!checked) skipped++;
      return checked;
    });

    let failed = 0;
    const updates: ImportBatch["updates"] = [];
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
      updates.push({ entry, current, approvedFields });
    }

    const progress = document.createElement("progress");
    progress.className = "w-full";
    progress.setAttribute("aria-label", "Import progress");
    // The button that was just pressed leaves with the review, so focus moves to the progress bar.
    progress.tabIndex = -1;
    this.reviewContainer?.replaceChildren(progress);
    progress.focus();
    const outcome = await executeImport(credentials, { creates, updates }, (done, total) => {
      progress.max = total;
      progress.value = done;
      if (this.statusEl) this.statusEl.textContent = `Importing ${done} of ${total}…`;
    });
    const { imported, updated } = outcome;
    failed += outcome.failed;

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
