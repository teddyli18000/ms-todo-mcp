# AGENTS.md

## Project goal
`ms-todo-mcp` is a public, self-hostable Cloudflare Remote MCP connector for Microsoft To Do, designed primarily for ChatGPT.

## Non-negotiable safety boundary
- Do not expose deletion of tasks, lists, checklist items, linked resources, attachments, or extensions.
- Do not add arbitrary Microsoft Graph passthrough.
- Do not request mail, files, calendar, directory, or admin permissions.
- Current Microsoft Graph delegated scope is `Tasks.ReadWrite` plus OIDC/offline-access scopes needed for sign-in and refresh.
- Tokens and client secrets must never enter logs, MCP results, source control, or tests.

## Engineering rules
- Prefer Microsoft Graph v1.0 APIs; do not add beta APIs without an explicit documented reason.
- Keep pagination, cross-list scans, batch sizes, retries, file sizes, and timeouts bounded.
- Preserve MCP annotations and truthful idempotency/destructive hints.
- Every new write operation needs tests and a clear model-facing description.
- `npm run check` is the local/release gate.

## Architecture references
The project intentionally follows patterns already proven in `teddyli18000/agentmail-connector` and `teddyli18000/feishu-connector`: Cloudflare Worker Remote MCP, OAuth bridge, per-user Durable Object token vault, short-lived one-time OAuth browser state, sanitized logging, and explicit capability allowlists.
