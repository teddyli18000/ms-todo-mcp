# Cloudflare deployment

## 1. Microsoft Entra application

Create an app registration in Microsoft Entra ID.

Recommended supported account type:

> Accounts in any organizational directory and personal Microsoft accounts

Add a **Web** redirect URI after you know the Worker hostname:

```text
https://<worker-host>/oauth/microsoft/callback
```

Under Microsoft Graph -> Delegated permissions, add:

```text
Tasks.ReadWrite
```

Create a client secret and keep it outside Git.

## 2. Cloudflare KV

The Cloudflare OAuth Provider library needs `OAUTH_KV`.

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned namespace id into `wrangler.jsonc`, replacing:

```text
00000000000000000000000000000000
```

## 3. Secrets

```bash
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
```

## 4. Validate and deploy

```bash
npm install
npm run check
npm run deploy
```

Check:

```text
GET https://<worker-host>/health
```

Expected:

```json
{ "ok": true, "version": "0.1.0" }
```

## 5. Add the Microsoft callback

If the Worker hostname was not known when the Entra app was created, now add exactly:

```text
https://<worker-host>/oauth/microsoft/callback
```

The URI must match exactly.

## 6. Connect ChatGPT

Use the Remote MCP URL:

```text
https://<worker-host>/mcp
```

ChatGPT should start the connector OAuth flow, redirect to Microsoft, and then return to ChatGPT after consent.

## Troubleshooting

- `AADSTS50011`: Microsoft redirect URI does not exactly match the Worker callback.
- missing refresh token: reconnect and ensure the authorization request includes `offline_access` (the connector does this by default).
- `401/403` from Graph: reconnect and verify delegated `Tasks.ReadWrite` is granted.
- custom task lists missing on a personal account: capture a minimal reproducible Graph response before adding any local registry workaround. The project intentionally avoids a shadow database unless the limitation is reproduced.
