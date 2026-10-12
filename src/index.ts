import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { MicrosoftTodoMCP } from "./mcp";
import { MicrosoftOAuthHandler } from "./oauth-handler";

export { MicrosoftTodoMCP } from "./mcp";
export { MicrosoftOAuthStateVault } from "./oauth-state-vault";
export { MicrosoftTokenVault } from "./token-vault";

const mcpHandler = MicrosoftTodoMCP.serve("/mcp", { binding: "MCP_OBJECT" });

export default new OAuthProvider({
  apiHandlers: { "/mcp": mcpHandler },
  defaultHandler: MicrosoftOAuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["todo.manage"],
});
