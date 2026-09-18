import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRuntime } from "@mirrorgap/runtime";
import { buildTools } from "./tools.js";

/**
 * MirrorGap MCP server (stdio). Exposes the deterministic engine as tools so
 * agents can investigate RWA integrity, not just read prices.
 *
 * Claude Code / MCP client config:
 *   { "mcpServers": { "mirrorgap": { "command": "pnpm", "args": ["--filter","@mirrorgap/mcp","start"] } } }
 */
async function main(): Promise<void> {
  const instance = createRuntime();
  const server = new McpServer({ name: "mirrorgap", version: "0.1.0" }, { capabilities: { tools: {} } });

  for (const tool of buildTools(instance)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.handler(args);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
          };
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
  process.on("SIGINT", () => {
    instance.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
