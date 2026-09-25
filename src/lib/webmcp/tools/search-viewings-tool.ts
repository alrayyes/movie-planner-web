import { listViewings } from "../../caldav/client";
import { filterViewings, type ViewingFilters } from "../../movie-log/filter-viewings";
import { importCheckRange } from "../../movie-log/run-import";
import {
  configFromCredentials,
  loadEnabledCredentials,
  WEBMCP_DISABLED_RESULT,
} from "../credentials-guard";
import { errorMessage, registerWebMcpTool, textResult, type WebMcpToolResult } from "../types";

// #667: caps how many matching viewings get handed back to an agent —
// an unbounded watch history dumped into a tool result is a poor fit for
// an agent's own context, not just slow.
const DEFAULT_LIMIT = 50;

interface SearchViewingsInput extends ViewingFilters {
  limit?: number;
}

export const SEARCH_FILTER_PROPERTIES = {
  title: { type: "string", description: "Substring match against the title." },
  medium: { type: "string" },
  venue: { type: "string" },
  director: { type: "string" },
  actor: { type: "string" },
  genre: { type: "string" },
  city: { type: "string" },
  movieCountry: { type: "string" },
  movieLanguage: { type: "string" },
  rated: { type: "string" },
  releasedYear: { type: "string" },
  releasedMonth: { type: "string", description: "YYYY-MM." },
} as const;

export function registerSearchViewingsTool(): void {
  registerWebMcpTool<SearchViewingsInput>({
    name: "search_viewings",
    description:
      "Filter and search the visitor's own watch history, the same fields the overview's own filters use.",
    inputSchema: {
      type: "object",
      properties: {
        ...SEARCH_FILTER_PROPERTIES,
        limit: {
          type: "number",
          description: `Maximum number of matches to return (default ${DEFAULT_LIMIT}).`,
        },
      },
    },
    consequentialHint: false,
    async execute(input): Promise<WebMcpToolResult> {
      const credentials = await loadEnabledCredentials();
      if (!credentials) return WEBMCP_DISABLED_RESULT;
      try {
        const config = configFromCredentials(credentials);
        const all = await listViewings(config, importCheckRange());
        const matches = filterViewings(all, input);
        const limit = input.limit && input.limit > 0 ? input.limit : DEFAULT_LIMIT;
        return textResult(JSON.stringify(matches.slice(0, limit)));
      } catch (error) {
        return textResult(`Could not search viewings: ${errorMessage(error)}`, true);
      }
    },
  });
}
