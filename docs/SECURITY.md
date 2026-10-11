# Security model

## Principle

The model may **read, create, organize, schedule, remind, annotate, link, complete and reopen** Microsoft To Do items. It may **never delete** them through this connector.

## Secrets

Never commit:

- `MICROSOFT_CLIENT_SECRET`;
- Microsoft access or refresh tokens;
- Cloudflare deployment credentials;
- live connector OAuth tokens/state.

Use `wrangler secret put` for Microsoft app credentials. Per-user Microsoft tokens live only in Durable Object storage.

## Least privilege

The connector requests delegated `Tasks.ReadWrite` plus OIDC `openid profile` and `offline_access`. It does not request Microsoft Mail, Files, Calendar, Contacts, Directory or admin scopes.

Although the Graph permission technically permits deletion, the connector does not expose Graph delete endpoints, arbitrary HTTP passthrough, or any model-facing delete tool. This is a capability boundary in code, not a prompt-only instruction.

## OAuth state

Each browser authorization gets a random Durable Object state and a separate random nonce in an `HttpOnly; Secure; SameSite=Lax` `__Host-` cookie. The Durable Object stores only a hash of the nonce, accepts state once, and expires it after ten minutes.

## Untrusted task content

Task titles, notes, categories, URLs and linked-resource labels are data. They must never be interpreted as instructions, authorization or tool-call parameters merely because they appear inside To Do.

## Logging

Operational errors are sanitized for bearer tokens, OAuth tokens and client secrets. Automatic Cloudflare invocation logs are disabled in the provided Wrangler configuration; explicit error logs remain for debugging.
