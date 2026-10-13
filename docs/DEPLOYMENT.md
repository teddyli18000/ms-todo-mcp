# Cloudflare deployment

This is the production path for the public `ms-todo-mcp` Worker. The repository is designed to deploy from GitHub through Cloudflare Workers Builds; no local machine is required for the normal production workflow.

Never put Microsoft client secrets, Cloudflare API tokens, access tokens, or refresh tokens in Git.

## 1. Microsoft Entra application

Create an app registration in Microsoft Entra ID.

Supported account type:

> Accounts in any organizational directory and personal Microsoft accounts

Under **Microsoft Graph -> Delegated permissions**, add:

```text
Tasks.ReadWrite
```

The manifest should use access-token version 2 for this audience. Create a client secret and keep these values:

- Application (client) ID -> `MICROSOFT_CLIENT_ID`
- client secret **Value** -> `MICROSOFT_CLIENT_SECRET`

The secret ID is not the client secret value.

The connector requests only:

```text
openid profile offline_access Tasks.ReadWrite
```

It does not request Mail, Files, Calendar, Contacts, Directory, or admin scopes.

## 2. Cloudflare project and KV

Connect this GitHub repository to a Cloudflare Worker project. The deploy command is:

```text
npx wrangler deploy
```

`wrangler.jsonc` defines the Worker, Durable Objects, migrations, and `OAUTH_KV` binding. This repository's production branch contains the owner's public KV namespace ID. A fork or independent deployment must create its own KV namespace and replace that ID before deploying. A KV namespace ID is configuration, not a credential.

Do not copy another account's KV namespace ID and do not commit Cloudflare API tokens.

## 3. Runtime variables and secrets

In the **Worker's runtime settings**, add:

```text
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
```

`MICROSOFT_CLIENT_SECRET` must be a runtime Secret. The client ID is public and may be a runtime variable or Secret.

**Do not put these only in Workers Builds -> Build variables and secrets.** Build-time values are not automatically available to the running Worker. The connector validates its runtime Microsoft configuration and reports an unhealthy status when either value is missing or invalid.

After saving runtime bindings, deploy the new Worker version.

## 4. Verify the deployment

The production URL is of the form:

```text
https://<worker-host>
```

Open:

```text
https://<worker-host>/health
```

A correctly configured runtime returns HTTP 200 with a response like:

```json
{
  "ok": true,
  "version": "0.1.0",
  "microsoft_oauth_configured": true
}
```

A 503 response means the runtime Microsoft bindings are missing or malformed. Health validates local runtime configuration; it does not prove that the Entra secret, consent, or Microsoft Graph account access is valid until the OAuth flow is exercised.

## 5. Microsoft callback URI

In the Entra app, add this exact **Web** redirect URI:

```text
https://<worker-host>/oauth/microsoft/callback
```

The scheme, hostname, and path must match exactly. Keep implicit access-token and ID-token issuance disabled.

## 6. Connect ChatGPT

Add the Remote MCP server using:

```text
https://<worker-host>/mcp
```

Complete connector OAuth, then sign in to the Microsoft account whose To Do data should be managed. Consent should show the delegated To Do permission, not mail/files/calendar permissions.

A safe production smoke test is:

1. read connector capabilities;
2. list task lists;
3. read one existing task;
4. create or update a real task you actually want;
5. verify notes/date/reminder changes in Microsoft To Do;
6. complete and reopen a suitable task to verify both state transitions.

The connector intentionally has no cleanup/delete tool, so do not create disposable test items unless you are willing to remove them manually in Microsoft To Do.

## Optional CLI path for independent self-hosting

A fork can also be deployed with Wrangler from a trusted environment. Use Node.js 22 or newer and the committed lockfile:

```bash
npm ci
npm run check
npx wrangler whoami
```

Create your own KV namespace, replace the `OAUTH_KV` ID in `wrangler.jsonc`, set the two Microsoft runtime secrets with Wrangler, and run `npm run deploy`. The predeploy guard rejects the original all-zero placeholder if one is introduced.

The GitHub/Cloudflare path above remains the production workflow for this repository.

## Expected security boundary

- 24 bounded model-facing tools;
- no task/list/checklist/linked-resource/attachment delete tool;
- no arbitrary Microsoft Graph passthrough;
- PKCE + OIDC nonce + browser-bound one-time OAuth state;
- Microsoft ID-token signature/audience/issuer/time validation;
- per-user Durable Object token storage with refresh-generation protection;
- bounded pagination/batches/request timeouts and compact cross-list discovery output;
- attachment download/upload bounded to 25 MiB, with Microsoft Graph upload-session destinations validated before upload;
- automatic Cloudflare invocation logs disabled by Worker configuration.

## Troubleshooting

- Microsoft authorization URL contains `client_id=undefined`: runtime `MICROSOFT_CLIENT_ID` is missing; check Worker **runtime** variables, not Build variables.
- `AADSTS50011`: the Entra Web redirect URI does not exactly match `https://<worker-host>/oauth/microsoft/callback`.
- missing refresh token: reconnect; the connector includes `offline_access` by default.
- `401/403` from Graph: reconnect and verify delegated `Tasks.ReadWrite` is granted to the signed-in Microsoft account.
- `/health` returns 503: one of the Microsoft runtime bindings is absent or invalid.
- custom task lists missing on a personal account: capture a minimal reproducible Graph response before adding any local registry workaround. The project intentionally avoids a shadow database unless the limitation is reproduced.
