# Architecture

## Request path

```text
ChatGPT MCP client
  -> connector OAuth provider (`/authorize`, `/token`, `/register`)
  -> Microsoft account authorization (`/oauth/microsoft/callback`)
  -> per-user `MicrosoftTokenVault` Durable Object
  -> `MicrosoftTodoMCP` Durable Object / MCP tool surface
  -> Microsoft Graph v1.0
```

The connector uses the same broad architecture as the owner's Agent Mail and Feishu connectors: one public Worker URL, user-isolated upstream credentials, short-lived browser-bound OAuth state, and an explicit model-facing allowlist.

## OAuth layers

There are two distinct OAuth relationships:

1. **ChatGPT <-> connector** is handled by Cloudflare's Workers OAuth Provider library.
2. **connector <-> Microsoft** uses Microsoft identity platform authorization-code flow with `offline_access` so the Worker can refresh delegated Graph access without asking the user to sign in every hour.

The Microsoft ID token subject is used only to derive a stable per-authorization connector identity. Access and refresh tokens stay in the user's Durable Object token vault and never enter MCP output.

## Token refresh

Access tokens are refreshed five minutes before expiration. Concurrent refresh attempts are coalesced. If a user reauthorizes while a refresh request is in flight, the older refresh result is not allowed to overwrite the newer token generation.

## Tool boundary

The MCP server exposes explicit read/create/update/complete operations only. There is no arbitrary path/method tool. Graph `DELETE` is never needed by any model-facing operation.

All tools set MCP hints:

- reads: `readOnlyHint=true`, `idempotentHint=true`;
- create: non-idempotent write;
- update/complete/reopen: idempotent write;
- every exposed tool: `destructiveHint=false`, `openWorldHint=true`.

## Bounded behavior

- Microsoft Graph request timeout: 20 seconds;
- Graph JSON batch: max 20 requests;
- cross-list scan: max 50 lists;
- per-list summary/search pagination: bounded pages/items;
- cursor URLs must stay on `https://graph.microsoft.com/v1.0/...` and match the expected resource path.
