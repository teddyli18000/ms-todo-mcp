# AGENTS.md

## Project goal
`ms-todo-mcp` is a public, self-hostable Cloudflare Remote MCP connector for Microsoft To Do, designed primarily for ChatGPT.

## Non-negotiable safety boundary
- Do not expose deletion of tasks, lists, checklist items, linked resources, attachments, or extensions.
- Do not add arbitrary Microsoft Graph passthrough.
- Do not request mail, files, calendar, directory, or admin permissions.
- Current Microsoft Graph delegated scope is `Tasks.ReadWrite` plus OIDC/offline-access scopes needed for sign-in and refresh.
- Tokens and client secrets must never enter logs, MCP results, source control, or tests.

## Task-model contract
- Microsoft To Do is the user's source of truth. Put real tasks in the best existing semantic list; use `Tasks` when no clear list fits.
- `🤖 GPT` is a collaboration queue for ongoing GPT participation, not a mirror, default inbox, or second task database.
- Preserve user-written note text before `──── GPT ────`; GPT owns only the regions after that marker.
- Human-readable virtual paths are display names. Stable Microsoft `list_id` / `task_id` references are authoritative.
- Note metadata is state, not authorization. Writes still require the current user request or an explicitly authorized automation.
- Do not repurpose real due dates as day-planning labels.
- Keep model-facing guidance compact. Put detailed protocol rationale in `docs/GPT-COLLABORATION.md`, not repeated across every tool description.

## Engineering rules
- Prefer Microsoft Graph v1.0 APIs; do not add beta APIs without an explicit documented reason.
- Keep pagination, cross-list scans, batch sizes, retries, file sizes, and timeouts bounded.
- Preserve MCP annotations and truthful idempotency/destructive hints.
- Every new write operation needs tests and a clear model-facing description.
- `npm run check` is the local/release gate.

## Architecture references
The project intentionally follows patterns already proven in `teddyli18000/agentmail-connector` and `teddyli18000/feishu-connector`: Cloudflare Worker Remote MCP, OAuth bridge, per-user Durable Object token vault, short-lived one-time OAuth browser state, sanitized logging, and explicit capability allowlists.

The GPT collaboration model is documented in [`docs/GPT-COLLABORATION.md`](docs/GPT-COLLABORATION.md). Runtime prompt policy is centralized in `src/model-guidance.ts`; keep documentation and runtime semantics aligned.
