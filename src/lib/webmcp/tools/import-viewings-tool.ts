import { type ParsedRow, parseCsvImport, parseJsonImport } from "../../movie-log/import-rows";
import {
  applyImportUpdate,
  fetchExistingForImportCheck,
  importRow,
  planImport,
  planUpdates,
} from "../../movie-log/run-import";
import { loadEnabledCredentials, WEBMCP_DISABLED_RESULT } from "../credentials-guard";
import { errorMessage, registerWebMcpTool, textResult, type WebMcpToolResult } from "../types";

// #667: capped so a large, mostly-uninteresting import doesn't flood the
// agent's own context with a line per row — the counts in the summary
// are exact regardless, only the per-row detail list is truncated.
const MAX_DETAIL_LINES = 10;

interface ImportViewingsInput {
  format?: "json" | "csv";
  data?: string;
  // #667: no visible review UI exists for an agent call (unlike the real
  // bulk-import page's own per-field approval step), so this is the
  // whole of that decision — "create-only" (the default) never writes
  // to an existing viewing at all, "apply-updates" writes every changed
  // field an imported row's uid matches, same as approving all of them.
  mode?: "create-only" | "apply-updates";
}

export function registerImportViewingsTool(): void {
  registerWebMcpTool<ImportViewingsInput>({
    name: "import_viewings",
    description:
      'Bulk-import viewings from CSV or JSON text (the same format export_viewings produces). A likely duplicate is skipped, never created; a row matching an existing viewing by uid only gets written when mode is "apply-updates".',
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["json", "csv"] },
        data: { type: "string", description: "The CSV or JSON text to import." },
        mode: {
          type: "string",
          enum: ["create-only", "apply-updates"],
          description:
            "create-only (default): only creates new, non-duplicate viewings. apply-updates: also writes field changes onto a viewing an imported row matches by uid.",
        },
      },
      required: ["format", "data"],
    },
    consequentialHint: true,
    async execute(input): Promise<WebMcpToolResult> {
      const credentials = await loadEnabledCredentials();
      if (!credentials) return WEBMCP_DISABLED_RESULT;
      if (input?.format !== "json" && input?.format !== "csv") {
        return textResult('format must be "json" or "csv".', true);
      }
      if (!input.data) return textResult("data is required.", true);

      try {
        const rows: ParsedRow[] =
          input.format === "json" ? parseJsonImport(input.data) : parseCsvImport(input.data);
        const existing = await fetchExistingForImportCheck(credentials);
        const existingByUid = new Map(existing.map((v) => [v.uid, v]));

        const details: string[] = [];
        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const parsed of rows) {
          if (parsed.error) {
            skipped++;
            details.push(`row ${parsed.rowNumber}: ${parsed.error}`);
          }
        }

        for (const entry of planImport(rows, existing)) {
          if (entry.isDuplicate) {
            skipped++;
            details.push(
              `row ${entry.rowNumber}: looks like a duplicate of "${entry.duplicateOfTitle}", skipped`,
            );
            continue;
          }
          await importRow(credentials, entry.row);
          created++;
        }

        for (const entry of planUpdates(rows, existing)) {
          if (input.mode !== "apply-updates") {
            skipped++;
            details.push(
              `row ${entry.rowNumber}: matches an existing viewing (uid ${entry.uid}) with ` +
                `${entry.changes.length} field(s) changed — not applied (mode isn't "apply-updates")`,
            );
            continue;
          }
          const current = existingByUid.get(entry.uid);
          if (!current) continue;
          const approvedFields = new Set(entry.changes.map((change) => change.field));
          await applyImportUpdate(credentials, current, entry, approvedFields);
          updated++;
        }

        const summary = `Imported: created ${created}, updated ${updated}, skipped ${skipped}.`;
        if (details.length === 0) return textResult(summary);
        const shown = details.slice(0, MAX_DETAIL_LINES);
        const rest =
          details.length > MAX_DETAIL_LINES
            ? `\n…and ${details.length - MAX_DETAIL_LINES} more.`
            : "";
        return textResult(`${summary}\n${shown.join("\n")}${rest}`);
      } catch (error) {
        return textResult(`Could not import: ${errorMessage(error)}`, true);
      }
    },
  });
}
