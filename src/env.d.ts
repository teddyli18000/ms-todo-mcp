interface Env {
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  MICROSOFT_TOKEN_VAULT: DurableObjectNamespace;
  MICROSOFT_OAUTH_STATE: DurableObjectNamespace;
}
