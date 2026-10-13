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
- bounded cross-list due-today/overdue/upcoming summaries with compact output and total counts;
- bounded batch create, update and complete operations.

There is deliberately **no** task/list/checklist/resource/attachment deletion and no arbitrary Graph HTTP tool. The Microsoft permission itself is read/write, but deletion is not part of this connector's model-facing capability surface or Graph request paths.

Microsoft To Do's **My Day** smart view is not exposed by the public task-list surface used here. Due-today summaries are not presented as My Day.

## GPT collaboration model

The connector teaches agents a small task-management convention without changing the Microsoft To Do data model:

- real tasks stay in the most appropriate existing list, with `Tasks` as the fallback;
- `🤖 GPT` is reserved for ongoing GPT participation such as planning, research, review, tracking, waiting, and follow-up;
- GPT tickets reference source tasks instead of mirroring them;
- user-written note text is preserved, while GPT keeps a compact human-readable workspace plus stable ID-based machine state below it;
- real deadlines are not changed merely to represent today's plan.

See [`docs/GPT-COLLABORATION.md`](docs/GPT-COLLABORATION.md) for the protocol. Runtime guidance is centralized in `src/model-guidance.ts` so tool descriptions stay short.

## Permission boundary

The upstream Microsoft sign-in requests only:

```text
openid profile offline_access Tasks.ReadWrite
```

`Tasks.ReadWrite` is the delegated Microsoft Graph permission needed to create and update the signed-in user's Microsoft To Do data. The connector does not request mail, OneDrive/files, calendar, contacts, directory or admin permissions.

The Microsoft authorization-code flow also uses PKCE, a per-login OIDC nonce, browser-bound one-time state, and signature/audience/issuer/timestamp validation of the returned Microsoft ID token before it becomes the connector identity.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the exact sequence. This repository's production path is GitHub -> Cloudflare Workers Builds; no local checkout is required for normal deployment.

At a high level:

1. Create a Microsoft Entra app for work/school and personal Microsoft accounts with delegated `Tasks.ReadWrite`.
2. Connect the GitHub repository to a Cloudflare Worker and bind `OAUTH_KV` plus the three Durable Objects defined in `wrangler.jsonc`.
3. Put `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in the Worker's **runtime** Variables and Secrets, not only in Build variables.
4. Deploy `main` with `npx wrangler deploy` through Workers Builds.
5. Verify `/health`, then add the exact `https://<worker-host>/oauth/microsoft/callback` Web redirect URI to Entra.
6. Connect ChatGPT to `https://<worker-host>/mcp` and complete Microsoft sign-in.

Forks and independent deployments must create their own KV namespace and Microsoft app. The KV namespace ID is public configuration; OAuth secrets and user tokens remain deployment-only.

## Development

```bash
npm ci
npm run verify
npm run build-check
npm run check
```

The committed lockfile plus the project `.npmrc` make installs reproducible with `npm ci`. CI uses read-only repository permissions, pinned GitHub Action revisions, locked install, dependency audits, type-checking, Vitest, and a Wrangler dry-run bundle on every pull request and push to `main`.

## Design references

This implementation takes ideas from the Microsoft To Do MCP ecosystem while keeping its own narrow security boundary:

- `MAG-Cie/mcp-microsoft-todo` — broad task capabilities and MCP annotations;
- `fabienbutz/microsoft-todo-mcp` — least-privilege/no-telemetry posture;
- `jordanburke/microsoft-todo-mcp-server` — mature Graph CRUD/error-handling patterns;
- `akkilesh-a/microsoft-todo-mcp-server-self-hosted` — remote self-hosting lessons;
- `teddyli18000/agentmail-connector` and `teddyli18000/feishu-connector` — Cloudflare/OAuth/token-vault architecture used by this repository.

## License

MIT. See [`LICENSE`](LICENSE).
