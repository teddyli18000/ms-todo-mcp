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
2. **connector <-> Microsoft** uses Microsoft identity platform authorization-code flow with PKCE, OIDC nonce validation and `offline_access` so the Worker can refresh delegated Graph access without repeatedly asking the user to sign in.

The returned Microsoft ID token is verified against Microsoft signing keys and checked for audience, issuer, tenant, nonce and time validity before its stable identity claims are used. Access and refresh tokens stay in the user's Durable Object token vault and never enter MCP output.

## Token refresh

Access tokens are refreshed five minutes before expiration. Concurrent refresh attempts are coalesced. If a user reauthorizes while a refresh request is in flight, the older refresh result is not allowed to overwrite the newer token generation.

## Tool boundary

The MCP server exposes 24 explicit read/create/update/complete/attach operations. There is no arbitrary path/method tool and no model-facing delete tool. Graph `DELETE` is not required by any exposed operation; failed attachment upload sessions are left to expire rather than cancelled with a delete request.

MCP safety hints describe effects rather than the project's separate no-delete promise:

- reads are `readOnlyHint=true`, `idempotentHint=true`;
- create/attach operations are non-idempotent writes but do not overwrite existing user data;
- rename/update/complete/reopen operations are idempotent state mutations and therefore use `destructiveHint=true` because they can overwrite existing fields/state;
- Microsoft To Do account operations are closed-world (`openWorldHint=false`);
- the attachment-input tool alone uses `openWorldHint=true` because it retrieves a ChatGPT-authorized HTTPS file URL before uploading the bytes to Microsoft To Do.

`destructiveHint=true` on a mutation does **not** mean the connector exposes deletion. Deletion remains absent from both the tool allowlist and Graph operation paths.

## Bounded behavior

- Microsoft Graph request timeout: 20 seconds;
- Graph JSON batch: max 20 requests;
- cross-list scan: max 50 lists;
- per-list summary/search pagination: bounded pages/items;
- pagination cursors must stay on `https://graph.microsoft.com/v1.0/...` and match the exact expected collection path;
- ChatGPT attachment download: max 25 MiB, bounded redirects/stream chunks/time;
- Microsoft To Do attachment upload: 2 MiB chunks, bounded per-request timeout, validated Graph upload-session destination.
