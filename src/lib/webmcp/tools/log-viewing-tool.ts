import { logManualViewing } from "../../movie-log/log-viewing";
import { loadEnabledCredentials, WEBMCP_DISABLED_RESULT } from "../credentials-guard";
import { errorMessage, registerWebMcpTool, textResult, type WebMcpToolResult } from "../types";
import { VIEWING_FIELD_PROPERTIES, type ViewingFieldsInput } from "./viewing-fields-schema";

type LogViewingInput = Required<Pick<ViewingFieldsInput, "title" | "start" | "end" | "medium">> &
  ViewingFieldsInput;

export function registerLogViewingTool(): void {
  registerWebMcpTool<LogViewingInput>({
    name: "log_viewing",
    description: "Log a manually-watched title to the visitor's own CalDAV calendar.",
    inputSchema: {
      type: "object",
      properties: VIEWING_FIELD_PROPERTIES,
      required: ["title", "start", "end", "medium"],
    },
    consequentialHint: false,
    async execute(input): Promise<WebMcpToolResult> {
      const credentials = await loadEnabledCredentials();
      if (!credentials) return WEBMCP_DISABLED_RESULT;
      try {
        const result = await logManualViewing(credentials, {
          title: input.title,
          start: input.start,
          end: input.end,
          medium: input.medium,
          venue: input.venue,
          notes: input.notes,
          director: input.director,
          actors: input.actors,
          genre: input.genre,
          year: input.year,
        });
        return textResult(`Logged "${result.viewing.title}" (uid ${result.viewing.uid}).`);
      } catch (error) {
        return textResult(`Could not log the viewing: ${errorMessage(error)}`, true);
      }
    },
  });
}
