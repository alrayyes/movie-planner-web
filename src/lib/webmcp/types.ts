// #667: the WebMCP draft (github.com/webmachinelearning/webmcp) is still
// moving — this mirrors the shared MCP tool-result convention (a content
// array plus an isError flag) rather than a shape lifted from any one
// snapshot of the spec, since every consumer can read content[0].text
// regardless of how the draft's own error signalling ultimately settles.
export interface WebMcpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface WebMcpToolDefinition<Input> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // #667 security guidance (developer.chrome.com/docs/ai/webmcp/secure-tools):
  // marks a destructive/irreversible tool so the agent's own UI asks the
  // visitor to confirm before calling it. Not a boundary this app itself
  // enforces — see webMcpEnabled's own doc comment in credentials/types.ts.
  consequentialHint: boolean;
  execute(input: Input): Promise<WebMcpToolResult>;
}

interface ModelContext {
  registerTool(tool: WebMcpToolDefinition<never>): void | Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export function registerWebMcpTool<Input>(tool: WebMcpToolDefinition<Input>): void {
  document.modelContext?.registerTool(tool as unknown as WebMcpToolDefinition<never>);
}

export function textResult(text: string, isError = false): WebMcpToolResult {
  return { content: [{ type: "text", text }], isError };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
