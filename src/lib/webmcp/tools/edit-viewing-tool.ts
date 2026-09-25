import { getViewing, updateViewing } from "../../caldav/client";
import type { NewViewing } from "../../caldav/types";
import {
  configFromCredentials,
  loadEnabledCredentials,
  WEBMCP_DISABLED_RESULT,
} from "../credentials-guard";
import { errorMessage, registerWebMcpTool, textResult, type WebMcpToolResult } from "../types";
import {
  pickSuppliedFields,
  VIEWING_FIELD_PROPERTIES,
  type ViewingFieldsInput,
} from "./viewing-fields-schema";

interface EditViewingInput extends ViewingFieldsInput {
  uid: string;
}

export function registerEditViewingTool(): void {
  registerWebMcpTool<EditViewingInput>({
    name: "edit_viewing",
    description: "Change fields on an already-logged viewing, leaving everything else as is.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "The viewing's uid." },
        ...VIEWING_FIELD_PROPERTIES,
      },
      required: ["uid"],
    },
    consequentialHint: false,
    async execute(input): Promise<WebMcpToolResult> {
      const credentials = await loadEnabledCredentials();
      if (!credentials) return WEBMCP_DISABLED_RESULT;
      if (!input?.uid) return textResult("uid is required.", true);
      try {
        const config = configFromCredentials(credentials);
        const existing = await getViewing(config, input.uid);
        if (!existing) return textResult(`No viewing found with uid ${input.uid}.`, true);
        const { uid: _uid, ...existingFields } = existing;
        const merged: NewViewing = { ...existingFields, ...pickSuppliedFields(input) };
        const updated = await updateViewing(config, input.uid, merged);
        return textResult(`Updated "${updated.title}" (uid ${updated.uid}).`);
      } catch (error) {
        return textResult(`Could not update the viewing: ${errorMessage(error)}`, true);
      }
    },
  });
}
