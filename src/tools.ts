import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GPT_COLLABORATION_LIST, GPT_NOTE_MARKER } from "./model-guidance";
import { schemas, type ToolName } from "./tool-schemas";
import type { RunToolOperation, ToolResult } from "./types";

type ToolSpec = {
  title: string;
  description: string;
  readOnly: boolean;
  idempotent: boolean;
  destructive?: boolean;
  openWorld?: boolean;
};

const specs: Record<ToolName, ToolSpec> = {
  get_todo_capabilities: { title: "Get Microsoft To Do capabilities", description: "Show the connected identity, permission boundary, available management capabilities, and explicit no-delete boundary.", readOnly: true, idempotent: true },
  list_task_lists: { title: "List Microsoft To Do lists", description: "List task lists with bounded pagination.", readOnly: true, idempotent: true },
  get_task_list: { title: "Get Microsoft To Do list", description: "Read one task list by list_id.", readOnly: true, idempotent: true },
  list_tasks: { title: "List Microsoft To Do tasks", description: "List tasks in one list with bounded pagination and status filtering.", readOnly: true, idempotent: true },
  get_task: { title: "Get Microsoft To Do task", description: "Read one task including notes, dates, reminder, recurrence, categories, status, and ETag when returned by Graph.", readOnly: true, idempotent: true },
  search_tasks: { title: "Search Microsoft To Do tasks", description: "Bounded cross-list search across task titles, notes, and categories.", readOnly: true, idempotent: true },
  summarize_tasks: { title: "Summarize Microsoft To Do tasks", description: "Return overdue, due-today, upcoming, and undated tasks across lists. Pass the user's local date when timezone matters.", readOnly: true, idempotent: true },
  list_checklist_items: { title: "List task checklist items", description: "List checklist/subtask items for one Microsoft To Do task.", readOnly: true, idempotent: true },
  list_linked_resources: { title: "List task linked resources", description: "List URLs or external resources linked to one task.", readOnly: true, idempotent: true },
  list_task_attachments: { title: "List task attachment metadata", description: "List Microsoft To Do task attachment metadata. This connector does not expose attachment deletion.", readOnly: true, idempotent: true },
  create_task_list: { title: "Create Microsoft To Do list", description: "Create a new task list. No list deletion tool exists.", readOnly: false, idempotent: false },
  rename_task_list: { title: "Rename Microsoft To Do list", description: "Rename a user-created task list. Optionally supply the ETag observed during a prior read.", readOnly: false, idempotent: true, destructive: true },
  create_task: { title: "Create Microsoft To Do task", description: `Create one task. Prefer its semantic existing list; use Tasks when none fits. Use ${GPT_COLLABORATION_LIST} only for ongoing GPT participation, never as a mirror.`, readOnly: false, idempotent: false },
  update_task: { title: "Update Microsoft To Do task", description: `Update supported fields in place. For ${GPT_COLLABORATION_LIST} notes, preserve user text before ${GPT_NOTE_MARKER}; re-read first when needed. No delete is exposed.`, readOnly: false, idempotent: true, destructive: true },
  complete_task: { title: "Complete Microsoft To Do task", description: `Mark one task completed. Completing a ${GPT_COLLABORATION_LIST} ticket does not complete linked source tasks unless the current request authorizes that sync.`, readOnly: false, idempotent: true, destructive: true },
  reopen_task: { title: "Reopen Microsoft To Do task", description: `Move one task back to notStarted. Reopen linked source tasks only when the current request authorizes that sync.`, readOnly: false, idempotent: true, destructive: true },
  create_checklist_item: { title: "Create task checklist item", description: "Add a checklist/subtask item to a task.", readOnly: false, idempotent: false },
  update_checklist_item: { title: "Update task checklist item", description: "Rename or check/uncheck a checklist item. Deletion is intentionally unavailable.", readOnly: false, idempotent: true, destructive: true },
  create_linked_resource: { title: "Create task linked resource", description: "Attach an external URL/reference to a task without granting arbitrary HTTP access.", readOnly: false, idempotent: false },
  update_linked_resource: { title: "Update task linked resource", description: "Update an existing linked-resource record. Deletion is intentionally unavailable.", readOnly: false, idempotent: true, destructive: true },
  attach_file_to_task: { title: "Attach file to Microsoft To Do task", description: "Attach one ChatGPT-authorized file to a task using the Microsoft To Do upload-session API. Files are bounded to 25 MiB. This tool cannot delete attachments.", readOnly: false, idempotent: false, openWorld: true },
  batch_create_tasks: { title: "Batch create Microsoft To Do tasks", description: "Create up to 20 tasks. Apply the same list-placement rule to each item; do not create planning mirrors.", readOnly: false, idempotent: false },
  batch_update_tasks: { title: "Batch update Microsoft To Do tasks", description: `Update up to 20 tasks. Preserve user-owned note text on ${GPT_COLLABORATION_LIST} tickets and use expected ETags when available.`, readOnly: false, idempotent: true, destructive: true },
  batch_complete_tasks: { title: "Batch complete Microsoft To Do tasks", description: `Mark up to 20 tasks completed. Do not infer linked-source completion from ${GPT_COLLABORATION_LIST} tickets without current authorization.`, readOnly: false, idempotent: true, destructive: true },
};

export const TOOL_NAMES = Object.keys(specs) as ToolName[];

export function registerTodoTools(server: McpServer, run: RunToolOperation): void {
  for (const name of TOOL_NAMES) {
    if (name === "attach_file_to_task") registerFileTool(server, run);
    else registerTool(server, run, name, specs[name]);
  }
}

function registerTool(server: McpServer, run: RunToolOperation, name: Exclude<ToolName, "attach_file_to_task">, spec: ToolSpec): void {
  const schema = schemas[name];
  (server.registerTool as unknown as (
    name: string,
    config: Record<string, unknown>,
    callback: (input: unknown) => Promise<ToolResult>,
  ) => void)(name, {
    title: spec.title,
    description: spec.description,
    inputSchema: schema,
    annotations: {
      readOnlyHint: spec.readOnly,
      destructiveHint: spec.destructive ?? false,
      idempotentHint: spec.idempotent,
      openWorldHint: spec.openWorld ?? false,
    },
  }, async (raw: unknown) => run({ name, input: schema.parse(raw) as Record<string, unknown> }));
}

function registerFileTool(server: McpServer, run: RunToolOperation): void {
  const name = "attach_file_to_task" as const;
  const schema = schemas[name];
  const spec = specs[name];
  registerAppTool(
    server,
    name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: schema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { "openai/fileParams": ["file"] },
    },
    async (raw: unknown) => run({ name, input: schema.parse(raw) as Record<string, unknown> }),
  );
}
