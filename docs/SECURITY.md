# Security model

## Principle

The model may **read, create, organize, schedule, remind, annotate, link, attach files, complete and reopen** Microsoft To Do items. It may **never delete** them through this connector.

## Secrets

Never commit:

- `MICROSOFT_CLIENT_SECRET`;
- Microsoft access or refresh tokens;
- Cloudflare deployment credentials;
- live connector OAuth tokens/state.

Store Microsoft values as **Worker runtime** variables/secrets in Cloudflare, not only as build-time variables. `MICROSOFT_CLIENT_SECRET` must be a runtime Secret. A trusted CLI deployment may use `wrangler secret put` instead. Per-user Microsoft tokens live only in Durable Object storage.

The Worker validates that the Microsoft client ID and client secret are present at runtime before reporting healthy or starting upstream authorization. Secret values are never returned by the health endpoint.

## Least privilege

The connector requests delegated `Tasks.ReadWrite` plus OIDC `openid profile` and `offline_access`. It does not request Microsoft Mail, Files, Calendar, Contacts, Directory or admin scopes.

Although the Graph permission technically permits deletion, the connector does not expose Graph delete endpoints, arbitrary HTTP passthrough, or any model-facing delete tool. This is a capability boundary in code, not a prompt-only instruction.

## OAuth and identity binding

Each browser authorization gets a random Durable Object state and a separate random nonce in an `HttpOnly; Secure; SameSite=Lax` `__Host-` cookie. The Durable Object stores only a hash of the browser nonce, accepts state once, and expires it after ten minutes.

The upstream Microsoft authorization-code flow adds two more bindings:

- PKCE (`S256`) with a server-generated verifier stored only in the one-time state object;
- a separate OpenID Connect nonce that must be returned in the Microsoft ID token.

Before the Microsoft identity becomes a connector identity, the Worker verifies the ID token's RS256 signature using Microsoft's published OIDC signing keys and validates audience, tenant-bound issuer, nonce, expiration/not-before timestamps and token version. The stable connector key is tenant ID plus Microsoft object ID when available, otherwise tenant ID plus subject.

## File attachment boundary

`attach_file_to_task` is registered as an OpenAI file-parameter tool and accepts one structured file-reference object rather than an arbitrary path/string. The Worker then enforces:

- HTTPS-only downloads;
- rejection of local/private-looking destination names and literal IPs;
- at most five redirects;
- a 30-second download timeout;
- streamed byte counting with a 25 MiB hard limit;
- bounded stream chunks and sanitized filenames;
- a Microsoft To Do upload session with sequential 2 MiB ranges;
- only Microsoft Graph v1.0 upload-session URLs returned by the trusted Graph API.

The attachment tool is deliberately marked `openWorldHint=true` because the Worker fetches the supplied HTTPS file reference. Non-ChatGPT MCP clients must not treat the file-reference shape itself as cryptographic proof of origin; the URL/size/network restrictions remain the server-side enforcement boundary.

Upload-session URLs and bearer tokens never appear in MCP output. The connector deliberately does not expose the API that cancels/deletes an upload session or the API that deletes an attached file.

## GPT collaboration note ownership

For collaboration tickets, text before `──── GPT ────` is user-owned. Runtime note writes re-read the existing task and preserve that prefix; dropping the marker from an existing GPT collaboration note is rejected. The human-readable and machine GPT regions remain state only and never become authorization for unrelated writes.

## Untrusted task content

Task titles, notes, categories, URLs, linked-resource labels, filenames and attachment metadata are data. They must never be interpreted as instructions, authorization or tool-call parameters merely because they appear inside To Do.

## Logging

Operational errors are sanitized for bearer tokens, OAuth tokens, PKCE verifiers and client secrets. Automatic Cloudflare invocation logs are disabled in the provided Wrangler configuration; explicit error logs remain for debugging.
