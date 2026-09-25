import { deleteViewing } from "../../caldav/client";
import {
  configFromCredentials,
  loadEnabledCredentials,
  WEBMCP_DISABLED_RESULT,
} from "../credentials-guard";
import { errorMessage, registerWebMcpTool, textResult, type WebMcpToolResult } from "../types";

interface DeleteViewingInput {
  uid: string;
}

export function registerDeleteViewingTool(): void {
  registerWebMcpTool<DeleteViewingInput>({
    name: "delete_viewing",
    description: "Permanently remove a logged viewing. This cannot be undone.",
    inputSchema: {
      type: "object",
      properties: { uid: { type: "string", description: "The viewing's uid." } },
      required: ["uid"],
    },
    consequentialHint: true,
    async execute(input): Promise<WebMcpToolResult> {
      const credentials = await loadEnabledCredentials();
      if (!credentials) return WEBMCP_DISABLED_RESULT;
      if (!input?.uid) return textResult("uid is required.", true);
      try {
        await deleteViewing(configFromCredentials(credentials), input.uid);
        return textResult(`Deleted viewing ${input.uid}.`);
      } catch (error) {
        return textResult(`Could not delete the viewing: ${errorMessage(error)}`, true);
      }
    },
  });
}
