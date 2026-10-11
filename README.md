# ms-todo-mcp

Public, self-hostable **Remote MCP connector for Microsoft To Do**. It lets ChatGPT manage the Microsoft To Do account authorized by each user while deliberately exposing **no delete capability**.

```text
ChatGPT -> OAuth + MCP over HTTPS -> Cloudflare Worker
        -> per-user Durable Object token vault -> Microsoft Graph v1.0 -> Microsoft To Do
```

## What ChatGPT can manage

The connector exposes 24 bounded model-facing tools:

- task lists: read, create, rename;
- tasks: read, search, create, update, complete, reopen;
- notes/body, categories, due date (DDL), start date, reminders, importance and status;
- recurring tasks using Microsoft Graph patterned recurrence;
- checklist/subtask items: read, create, rename, check and uncheck;
- linked resources: read, create and update;
- attachments: list metadata and upload one ChatGPT-authorized file at a time, up to 25 MiB;
- bounded cross-list today/overdue/upcoming summaries;
- bounded batch create, update and complete operations.

There is deliberately **no** task/list/checklist/resource/attachment deletion and no arbitrary Graph HTTP tool. The Microsoft permission itself is read/write, but deletion is not part of this connector's model-facing capability surface or Graph request paths.

## Permission boundary

The upstream Microsoft sign-in requests only:

```text
openid profile offline_access Tasks.ReadWrite
```

`Tasks.ReadWrite` is the delegated Microsoft Graph permission needed to create and update the signed-in user's Microsoft To Do data. The connector does not request mail, OneDrive/files, calendar, contacts, directory or admin permissions.

The Microsoft authorization-code flow also uses PKCE, a per-login OIDC nonce, browser-bound one-time state, and signature/audience/issuer/timestamp validation of the returned Microsoft ID token before it becomes the connector identity.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the exact sequence. At a high level:

1. Create a Microsoft Entra app that supports personal Microsoft accounts and work/school accounts, add delegated Microsoft Graph `Tasks.ReadWrite`, and create a client secret.
2. Create Cloudflare `OAUTH_KV` and replace the placeholder namespace id in `wrangler.jsonc`.
3. Store `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` with `wrangler secret put`.
4. Run `npm ci` and `npm run check`, then deploy the Worker.
5. Add the exact deployed callback `https://<worker-host>/oauth/microsoft/callback` to the Entra app.
6. Connect ChatGPT to `https://<worker-host>/mcp` and complete Microsoft sign-in.

## Development

```bash
npm ci
npm run verify
npm run build-check
npm run check
```

The committed lockfile plus the project `.npmrc` make installs reproducible with `npm ci`. CI runs locked install, type-checks, Vitest, and a Wrangler dry-run bundle on every pull request and on pushes to `main`.

## Design references

This implementation takes ideas from the Microsoft To Do MCP ecosystem while keeping its own narrow security boundary:

- `MAG-Cie/mcp-microsoft-todo` — broad task capabilities and MCP annotations;
- `fabienbutz/microsoft-todo-mcp` — least-privilege/no-telemetry posture;
- `jordanburke/microsoft-todo-mcp-server` — mature Graph CRUD/error-handling patterns;
- `akkilesh-a/microsoft-todo-mcp-server-self-hosted` — remote self-hosting lessons;
- `teddyli18000/agentmail-connector` and `teddyli18000/feishu-connector` — Cloudflare/OAuth/token-vault architecture used by this repository.

## License

MIT. See [`LICENSE`](LICENSE).
