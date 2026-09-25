import { exportViewingsToJson } from "../../movie-log/export-viewings";
import type { ViewingFilters } from "../../movie-log/filter-viewings";
import { filterViewings } from "../../movie-log/filter-viewings";
import { fetchExistingForImportCheck } from "../../movie-log/run-import";
import { loadEnabledCredentials, WEBMCP_DISABLED_RESULT } from "../credentials-guard";
import { errorMessage, registerWebMcpTool, textResult, type WebMcpToolResult } from "../types";
import { SEARCH_FILTER_PROPERTIES } from "./search-viewings-tool";

export function registerExportViewingsTool(): void {
  registerWebMcpTool<ViewingFilters>({
    name: "export_viewings",
    description:
      'Export (optionally filtered) viewings as JSON, the same format Settings\' own "Export as JSON" produces and import_viewings reads back.',
    inputSchema: {
      type: "object",
      properties: SEARCH_FILTER_PROPERTIES,
    },
    consequentialHint: false,
    async execute(input): Promise<WebMcpToolResult> {
      const credentials = await loadEnabledCredentials();
      if (!credentials) return WEBMCP_DISABLED_RESULT;
      try {
        const all = await fetchExistingForImportCheck(credentials);
        const matches = filterViewings(all, input ?? {});
        return textResult(exportViewingsToJson(matches));
      } catch (error) {
        return textResult(`Could not export viewings: ${errorMessage(error)}`, true);
      }
    },
  });
}
