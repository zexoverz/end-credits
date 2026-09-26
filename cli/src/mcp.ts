// `endcredits mcp`: a stdio MCP server for Claude Code. stdout is the protocol channel, so every
// log line goes to stderr, and the agent key never appears in a result.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MCP_COPY } from "../../lib/copy/mcp";
import { explainTool, rollTool, statusTool, type ToolDeps, type ToolResult } from "./mcp-tools";

const VERSION = "0.1.0";

function wrap(run: () => Promise<ToolResult>) {
  return async () => {
    try {
      const r = await run();
      return { content: [{ type: "text" as const, text: r.text }], ...(r.isError ? { isError: true } : {}) };
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text" as const, text }], isError: true };
    }
  };
}

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: MCP_COPY.SERVER_NAME, version: VERSION });
  const { status, roll, explain } = MCP_COPY.TOOLS;
  const optionalId = { sessionId: z.string().max(128).optional() };

  server.registerTool(
    "end_credits_status",
    { title: status.title, description: status.description, inputSchema: { sessionId: optionalId.sessionId.describe(status.sessionId) } },
    (args) => wrap(() => statusTool(args, deps))(),
  );
  server.registerTool(
    "end_credits_roll",
    { title: roll.title, description: roll.description, inputSchema: { sessionId: optionalId.sessionId.describe(roll.sessionId) } },
    (args) => wrap(() => rollTool(args, deps))(),
  );
  server.registerTool(
    "end_credits_explain",
    { title: explain.title, description: explain.description, inputSchema: { sessionId: z.string().max(128).describe(explain.sessionId) } },
    (args) => wrap(() => explainTool(args, deps))(),
  );
  return server;
}

export async function runMcp(home: string): Promise<void> {
  const log = (line: string) => process.stderr.write(line + "\n");
  const server = buildServer({ home, fetch, now: () => new Date(), log });
  await server.connect(new StdioServerTransport());
}
