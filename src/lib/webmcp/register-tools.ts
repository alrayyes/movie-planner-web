import { loadEnabledCredentials } from "./credentials-guard";
import { registerDeleteViewingTool } from "./tools/delete-viewing-tool";
import { registerEditViewingTool } from "./tools/edit-viewing-tool";
import { registerLogViewingTool } from "./tools/log-viewing-tool";
import { registerSearchViewingsTool } from "./tools/search-viewings-tool";

// #667: called once, site-wide, from Layout.astro — mirrors
// registerServiceWorker()'s own "runs on every page, deferred, no-op
// where unsupported" shape.
export async function registerWebMcpTools(): Promise<void> {
  // WebMCP (github.com/webmachinelearning/webmcp) is a draft incubation,
  // not a ratified standard — only Chrome has an experimental,
  // flag-gated `document.modelContext` today. Progressive enhancement:
  // do nothing anywhere else.
  if (!("modelContext" in document)) return;

  // The visitor's own explicit opt-in (Settings' "Let a compatible
  // in-browser agent act on your behalf" checkbox) — off by default, see
  // webMcpEnabled's own doc comment in credentials/types.ts. Each tool's
  // own execute() re-checks this too, in case it's toggled off later in
  // the same page load.
  const credentials = await loadEnabledCredentials();
  if (!credentials) return;

  registerLogViewingTool();
  registerEditViewingTool();
  registerDeleteViewingTool();
  registerSearchViewingsTool();
}
