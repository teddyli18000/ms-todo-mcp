import { McpAgent } from "agents/mcp";
import { ZodError } from "zod";
import { createMicrosoftTodoMcpServer } from "./server-factory";
import { executeTodoOperation, formatTodoError } from "./todo-service";
import type { ConnectorProps, ToolOperation, ToolResult } from "./types";

export class MicrosoftTodoMCP extends McpAgent<Env, Record<string, never>, ConnectorProps> {
  server = createMicrosoftTodoMcpServer((operation) => this.runOperation(operation));

  async init(): Promise<void> {}

  private async runOperation(operation: ToolOperation): Promise<ToolResult> {
    const requestId = crypto.randomUUID();
    try {
      const props = this.props;
      if (!props) throw new Error("Microsoft To Do connector identity is unavailable. Reconnect the plugin.");
      return await executeTodoOperation(this.env, props, operation);
    } catch (error) {
      const message = error instanceof ZodError ? formatZod(error) : formatTodoError(error);
      console.error("Microsoft To Do MCP operation failed", { requestId, error: sanitizeLogText(message) });
      return { content: [{ type: "text", text: `${message} [request_id: ${requestId}]` }], isError: true };
    }
  }
}

function formatZod(error: ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "arguments";
  return `Invalid ${path}: ${issue?.message ?? "invalid tool arguments"}`;
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access_token|refresh_token|client_secret)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1000);
}
