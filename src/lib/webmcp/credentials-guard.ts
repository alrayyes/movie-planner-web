import type { CaldavConfig } from "../caldav/types";
import { getCredentialsStore } from "../credentials/store";
import type { Credentials } from "../credentials/types";
import { textResult, type WebMcpToolResult } from "./types";

export const WEBMCP_DISABLED_RESULT: WebMcpToolResult = textResult(
  "WebMCP tools are turned off. Enable them in Settings first.",
  true,
);

// #667: the credential-gating pattern every tool's execute() follows —
// re-checked on every call (not just once at registration time) since
// toggling the Settings checkbox off doesn't unregister already-registered
// tools until the next page load.
export async function loadEnabledCredentials(): Promise<Credentials | null> {
  const credentials = await getCredentialsStore().get();
  return credentials?.webMcpEnabled ? credentials : null;
}

export function configFromCredentials(credentials: Credentials): CaldavConfig {
  return {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
}
