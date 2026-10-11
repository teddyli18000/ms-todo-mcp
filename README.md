# ms-todo-mcp

Public, self-hostable **Remote MCP connector for Microsoft To Do**. It lets ChatGPT manage the Microsoft To Do account authorized by each user while deliberately exposing **no delete capability**.

```text
ChatGPT -> OAuth + MCP over HTTPS -> Cloudflare Worker
        -> per-user Durable Object token vault -> Microsoft Graph v1.0 -> Microsoft To Do
```

## What ChatGPT can manage

- task lists: read, create, rename;
- tasks: read, search, create, update, complete, reopen;
- notes/body, categories, due date (DDL), start date, reminders, importance and status;
- recurring tasks using Microsoft Graph patterned recurrence;
- checklist/subtask items: read, create, rename, check and uncheck;
- linked resources: read, create and update;
- attachment metadata: read/list;
- bounded cross-list today/overdue/upcoming summaries;
- bounded batch create, update and complete operations.

There is deliberately **no** task/list/checklist/resource/attachment deletion and no arbitrary Graph HTTP tool.

## Permission boundary

The upstream Microsoft sign-in requests only:

```text
openid profile offline_access Tasks.ReadWrite
```

`Tasks.ReadWrite` is the least-privileged delegated Graph permission for creating and updating the signed-in user's Microsoft To Do data. The connector does not request mail, OneDrive/files, calendar, contacts, directory or admin permissions.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). At a high level:

1. Create a Microsoft Entra app that supports personal Microsoft accounts and work/school accounts.
2. Add the Worker callback URL as a Web redirect URI: `https://<worker-host>/oauth/microsoft/callback`.
3. Add delegated Microsoft Graph permission `Tasks.ReadWrite`.
4. Create a Cloudflare KV namespace for the connector OAuth provider and replace the placeholder `OAUTH_KV` id in `wrangler.jsonc`.
5. Store `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` as Cloudflare secrets.
6. Run `npm run check`, then `npm run deploy`.
7. Connect ChatGPT to `https://<worker-host>/mcp` and complete Microsoft sign-in.

## Development

```bash
npm install
npm run verify
npm run build-check
npm run check
```

CI runs type-checks, Vitest, and a Wrangler dry-run bundle on every PR/push.

## Design references

This implementation takes ideas from the Microsoft To Do MCP ecosystem while keeping its own narrow security boundary:

- `MAG-Cie/mcp-microsoft-todo` — broad task capabilities and MCP annotations;
- `fabienbutz/microsoft-todo-mcp` — least-privilege/no-telemetry posture;
- `jordanburke/microsoft-todo-mcp-server` — mature Graph CRUD/error-handling patterns;
- `akkilesh-a/microsoft-todo-mcp-server-self-hosted` — remote self-hosting lessons;
- `teddyli18000/agentmail-connector` and `teddyli18000/feishu-connector` — Cloudflare/OAuth/token-vault architecture used by this repository.

## License

MIT. See [`LICENSE`](LICENSE).
