# Cloudflare deployment

This is the production path for the public `ms-todo-mcp` Worker. Do not put Microsoft secrets or user tokens in Git.

## 0. Local preflight

Use Node.js 22 or newer and the committed lockfile:

```bash
npm ci
npm run check
npx wrangler whoami
```

If Wrangler is not authenticated, run:

```bash
npx wrangler login
```

`npm run check` must pass before deployment. `npm run deploy` also runs a predeploy guard that refuses to deploy while the placeholder KV namespace id is still present.

## 1. Create the Cloudflare OAuth KV namespace

The Cloudflare OAuth Provider library needs the `OAUTH_KV` binding:

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned namespace id into `wrangler.jsonc`, replacing exactly:

```text
00000000000000000000000000000000
```

Then rerun:

```bash
npm run check
```

The KV namespace id is configuration, not a Microsoft credential. Do not put Cloudflare API tokens in the repository.

## 2. Create the Microsoft Entra application

Create an app registration in Microsoft Entra ID.

Recommended supported account type:

> Accounts in any organizational directory and personal Microsoft accounts

Under **Microsoft Graph -> Delegated permissions**, add:

```text
Tasks.ReadWrite
```

Create a client secret and copy both values while they are visible:

- Application (client) ID -> `MICROSOFT_CLIENT_ID`
- client secret value -> `MICROSOFT_CLIENT_SECRET`

The connector itself requests `openid profile offline_access Tasks.ReadWrite`. It does not request Mail, Files, Calendar, Contacts, Directory, or admin scopes.

If you already know the final Worker hostname, add this as a **Web** redirect URI now:

```text
https://<worker-host>/oauth/microsoft/callback
```

If you do not know the hostname yet, add the redirect URI after the first deployment in step 4.

## 3. Store the Microsoft values as Cloudflare Worker secrets

From the repository root:

```bash
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
```

Enter each value at Wrangler's prompt. Do not pass the client secret on the command line and do not add either value to `.env` files that might be committed.

Current Wrangler versions deploy a new Worker version when `secret put` succeeds. That is expected; the OAuth flow is not ready until the callback URI is configured and the final deployment has completed.

## 4. Deploy the Worker

```bash
npm run deploy
```

Record the stable Worker URL printed by Wrangler, for example:

```text
https://ms-todo-mcp.<your-workers-subdomain>.workers.dev
```

Check the health endpoint:

```bash
curl https://<worker-host>/health
```

Expected response:

```json
{ "ok": true, "version": "0.1.0" }
```

## 5. Set the exact Microsoft callback URI

In the Entra app, add or verify this **Web** redirect URI:

```text
https://<worker-host>/oauth/microsoft/callback
```

The scheme, hostname and path must match exactly. No wildcard callback is required.

## 6. Connect ChatGPT

Add a custom Remote MCP server in ChatGPT using:

```text
https://<worker-host>/mcp
```

Complete the connector OAuth flow and then sign in to the Microsoft account whose To Do data should be managed. Consent should show the delegated To Do permission, not mail/files/calendar permissions.

A safe first smoke test is read-only:

1. call the connector capabilities tool;
2. list task lists;
3. list tasks from one existing list.

After reads work, create or update a real task you actually want. The connector intentionally has no cleanup/delete tool, so do not create disposable test items unless you are willing to remove them manually in Microsoft To Do.

## Expected security boundary

- 24 bounded model-facing tools;
- no task/list/checklist/linked-resource/attachment delete tool;
- no arbitrary Microsoft Graph passthrough;
- PKCE + OIDC nonce + browser-bound one-time OAuth state;
- Microsoft ID-token signature/audience/issuer/time validation;
- per-user Durable Object token storage with refresh-generation protection;
- bounded pagination/batches/request timeouts;
- attachment download/upload bounded to 25 MiB, with Microsoft Graph upload-session destinations validated before upload.

## Troubleshooting

- `AADSTS50011`: the Entra Web redirect URI does not exactly match `https://<worker-host>/oauth/microsoft/callback`.
- missing refresh token: reconnect; the connector includes `offline_access` by default.
- `401/403` from Graph: reconnect and verify delegated `Tasks.ReadWrite` is granted to the signed-in Microsoft account.
- deploy guard says `replace the placeholder OAUTH_KV id`: create the KV namespace and update `wrangler.jsonc` before retrying.
- `npm ci` peer-resolution error: make sure the repository `.npmrc` and committed `package-lock.json` are both present; do not regenerate the lockfile with a different peer-resolution mode.
- custom task lists missing on a personal account: capture a minimal reproducible Graph response before adding any local registry workaround. The project intentionally avoids a shadow database unless the limitation is reproduced.
