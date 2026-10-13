import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MODEL_INSTRUCTIONS } from "./model-guidance";
import { registerTodoTools } from "./tools";
import type { RunToolOperation } from "./types";
import { CONNECTOR_VERSION } from "./version";

export function createMicrosoftTodoMcpServer(run: RunToolOperation): McpServer {
  const server = new McpServer(
    { name: "ms-todo-mcp", version: CONNECTOR_VERSION },
    { instructions: MODEL_INSTRUCTIONS },
  );
  registerTodoTools(server, run);
  return server;
}
