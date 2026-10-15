import { loadEnabledCredentials } from "./credentials-guard";

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

  // #932: the tools pull in the CalDAV client, the import code and the export
  // code, so they load only once a visitor has opted in. This runs on every
  // page, and most visitors never opt in.
  const [log, edit, remove, search, exportTool, importTool] = await Promise.all([
    import("./tools/log-viewing-tool"),
    import("./tools/edit-viewing-tool"),
    import("./tools/delete-viewing-tool"),
    import("./tools/search-viewings-tool"),
    import("./tools/export-viewings-tool"),
    import("./tools/import-viewings-tool"),
  ]);
  log.registerLogViewingTool();
  edit.registerEditViewingTool();
  remove.registerDeleteViewingTool();
  search.registerSearchViewingsTool();
  exportTool.registerExportViewingsTool();
  importTool.registerImportViewingsTool();
}
