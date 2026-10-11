import { decodeGraphCursor, encodeGraphCursor, graphBatch, GraphApiError, graphJson } from "./graph";
import type { ConnectorProps, GraphTodoTask, GraphTodoTaskList, ToolOperation, ToolResult } from "./types";

const MAX_LISTS_FOR_CROSS_LIST_SCAN = 50;

type ListResponse<T> = { value: T[]; "@odata.nextLink"?: string };
type ParsedInput = Record<string, any>;

export async function executeTodoOperation(env: Env, props: ConnectorProps, operation: ToolOperation): Promise<ToolResult> {
  const accessToken = await getAccessToken(env, props.userId);
  const input = operation.input as ParsedInput;
  switch (operation.name) {
    case "get_todo_capabilities":
      return result({
        connected_identity: { display_name: props.displayName, username: props.username },
        graph_scope: "Tasks.ReadWrite",
        destructive_operations: false,
        capabilities: [
          "lists: read/create/rename",
          "tasks: read/search/create/update/complete/reopen",
          "task fields: notes/categories/due/start/reminder/importance/status/recurrence",
          "checklist items: read/create/update/check/uncheck",
          "linked resources: read/create/update",
          "attachments: list metadata",
          "bounded batch create/update/complete",
          "today/overdue/upcoming summaries",
        ],
        unavailable: ["delete task", "delete list", "delete checklist item", "delete linked resource", "delete attachment", "arbitrary Graph passthrough"],
      });
    case "list_task_lists":
      return result(await listTaskLists(accessToken, input));
    case "get_task_list":
      return result(await graphJson(accessToken, `/me/todo/lists/${segment(input.list_id)}`));
    case "list_tasks":
      return result(await listTasks(accessToken, input));
    case "get_task":
      return result(await graphJson(accessToken, taskPath(input.list_id, input.task_id)));
    case "search_tasks":
      return result(await searchTasks(accessToken, input));
    case "summarize_tasks":
      return result(await summarizeTasks(accessToken, input));
    case "list_checklist_items":
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/checklistItems`));
    case "list_linked_resources":
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/linkedResources`));
    case "list_task_attachments":
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/attachments?$select=id,name,size,contentType,lastModifiedDateTime`));
    case "create_task_list":
      return result(await graphJson(accessToken, "/me/todo/lists", { method: "POST", body: JSON.stringify({ displayName: input.display_name }) }));
    case "rename_task_list":
      return result(await graphJson(accessToken, `/me/todo/lists/${segment(input.list_id)}`, patch({ displayName: input.display_name }, input.expected_etag)));
    case "create_task":
      return result(await graphJson(accessToken, `/me/todo/lists/${segment(input.list_id)}/tasks`, { method: "POST", body: JSON.stringify(toGraphTaskPatch(input, true)) }));
    case "update_task":
      return result(await graphJson(accessToken, taskPath(input.list_id, input.task_id), patch(toGraphTaskPatch(input, false), input.expected_etag)));
    case "complete_task":
      return result(await graphJson(accessToken, taskPath(input.list_id, input.task_id), patch({ status: "completed" }, input.expected_etag)));
    case "reopen_task":
      return result(await graphJson(accessToken, taskPath(input.list_id, input.task_id), patch({ status: "notStarted" }, input.expected_etag)));
    case "create_checklist_item":
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/checklistItems`, { method: "POST", body: JSON.stringify({ displayName: input.display_name, isChecked: input.is_checked }) }));
    case "update_checklist_item": {
      const body = removeUndefined({ displayName: input.display_name, isChecked: input.is_checked });
      requireNonEmpty(body, "checklist item update");
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/checklistItems/${segment(input.checklist_item_id)}`, patch(body)));
    }
    case "create_linked_resource":
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/linkedResources`, {
        method: "POST",
        body: JSON.stringify(removeUndefined({ webUrl: input.web_url, applicationName: input.application_name, displayName: input.display_name, externalId: input.external_id })),
      }));
    case "update_linked_resource": {
      const body = removeUndefined({ webUrl: input.web_url, applicationName: input.application_name, displayName: input.display_name, externalId: input.external_id });
      requireNonEmpty(body, "linked resource update");
      return result(await graphJson(accessToken, `${taskPath(input.list_id, input.task_id)}/linkedResources/${segment(input.linked_resource_id)}`, patch(body)));
    }
    case "batch_create_tasks":
      return result(await batchCreateTasks(accessToken, input));
    case "batch_update_tasks":
      return result(await batchUpdateTasks(accessToken, input));
    case "batch_complete_tasks":
      return result(await batchCompleteTasks(accessToken, input));
    default:
      throw new Error(`Unsupported Microsoft To Do operation: ${operation.name}`);
  }
}

async function getAccessToken(env: Env, userId: string): Promise<string> {
  const stub = env.MICROSOFT_TOKEN_VAULT.get(env.MICROSOFT_TOKEN_VAULT.idFromName(userId));
  const response = await stub.fetch("https://token-vault/access-token", { method: "POST" });
  const payload = (await response.json()) as { accessToken?: string; message?: string };
  if (!response.ok || !payload.accessToken) throw new Error(payload.message ?? "Microsoft authorization is unavailable. Reconnect the plugin.");
  return payload.accessToken;
}

async function listTaskLists(accessToken: string, input: ParsedInput): Promise<unknown> {
  const expected = "/me/todo/lists";
  const url = input.cursor ? decodeGraphCursor(input.cursor, expected) : `${expected}?$top=${input.limit}`;
  const payload = await graphJson<ListResponse<GraphTodoTaskList>>(accessToken, url);
  return { lists: payload.value, next_cursor: encodeGraphCursor(payload["@odata.nextLink"]) };
}

async function listTasks(accessToken: string, input: ParsedInput): Promise<unknown> {
  const expected = `/me/todo/lists/${segment(input.list_id)}/tasks`;
  const url = input.cursor ? decodeGraphCursor(input.cursor, expected) : `${expected}?$top=${input.limit}`;
  const payload = await graphJson<ListResponse<GraphTodoTask>>(accessToken, url);
  const tasks = payload.value.filter((task) => (input.include_completed || task.status !== "completed") && (!input.status || task.status === input.status));
  return { tasks, next_cursor: encodeGraphCursor(payload["@odata.nextLink"]) };
}

async function searchTasks(accessToken: string, input: ParsedInput): Promise<unknown> {
  const lists = await collectTaskLists(accessToken);
  const needle = String(input.query).toLocaleLowerCase();
  const matches: Array<{ list: GraphTodoTaskList; task: GraphTodoTask }> = [];
  for (const list of lists.slice(0, MAX_LISTS_FOR_CROSS_LIST_SCAN)) {
    const tasks = await collectTasks(accessToken, list.id, 200);
    for (const task of tasks) {
      if (!input.include_completed && task.status === "completed") continue;
      const haystack = `${task.title ?? ""}\n${task.body?.content ?? ""}\n${(task.categories ?? []).join(" ")}`.toLocaleLowerCase();
      if (haystack.includes(needle)) matches.push({ list, task });
      if (matches.length >= input.max_results) return { matches, truncated: true };
    }
  }
  return { matches, truncated: false };
}

async function summarizeTasks(accessToken: string, input: ParsedInput): Promise<unknown> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const upcomingEnd = addDays(today, input.days_ahead);
  const lists = await collectTaskLists(accessToken);
  const summary = { today, overdue: [] as unknown[], due_today: [] as unknown[], upcoming: [] as unknown[], without_due_date: [] as unknown[], truncated_lists: lists.length > MAX_LISTS_FOR_CROSS_LIST_SCAN };
  for (const list of lists.slice(0, MAX_LISTS_FOR_CROSS_LIST_SCAN)) {
    const tasks = await collectTasks(accessToken, list.id, input.max_tasks_per_list);
    for (const task of tasks) {
      if (!input.include_completed && task.status === "completed") continue;
      const entry = { list_id: list.id, list_name: list.displayName, task };
      const due = task.dueDateTime?.dateTime?.slice(0, 10);
      if (!due) summary.without_due_date.push(entry);
      else if (due < today) summary.overdue.push(entry);
      else if (due === today) summary.due_today.push(entry);
      else if (due <= upcomingEnd) summary.upcoming.push(entry);
    }
  }
  return summary;
}

async function collectTaskLists(accessToken: string): Promise<GraphTodoTaskList[]> {
  const output: GraphTodoTaskList[] = [];
  let url: string | undefined = "/me/todo/lists?$top=100";
  for (let page = 0; url && page < 5; page += 1) {
    const payload: ListResponse<GraphTodoTaskList> = await graphJson<ListResponse<GraphTodoTaskList>>(accessToken, url);
    output.push(...payload.value);
    url = payload["@odata.nextLink"];
  }
  return output;
}

async function collectTasks(accessToken: string, listId: string, maxTasks: number): Promise<GraphTodoTask[]> {
  const output: GraphTodoTask[] = [];
  let url: string | undefined = `/me/todo/lists/${segment(listId)}/tasks?$top=${Math.min(100, maxTasks)}`;
  for (let page = 0; url && page < 5 && output.length < maxTasks; page += 1) {
    const payload: ListResponse<GraphTodoTask> = await graphJson<ListResponse<GraphTodoTask>>(accessToken, url);
    output.push(...payload.value);
    url = payload["@odata.nextLink"];
  }
  return output.slice(0, maxTasks);
}

function toGraphTaskPatch(input: ParsedInput, creating: boolean): Record<string, unknown> {
  const body = removeUndefined({
    title: input.title,
    body: input.body === undefined ? undefined : { content: input.body, contentType: "text" },
    categories: input.categories,
    dueDateTime: input.dueDateTime,
    startDateTime: input.startDateTime,
    reminderDateTime: input.reminderDateTime,
    isReminderOn: input.isReminderOn,
    importance: input.importance,
    status: input.status,
    recurrence: input.recurrence,
  });
  if (creating && !body.title) throw new Error("Task title is required.");
  if (!creating) requireNonEmpty(body, "task update");
  return body;
}

async function batchCreateTasks(accessToken: string, input: ParsedInput): Promise<unknown> {
  const listId = segment(input.list_id);
  const responses = await graphBatch(accessToken, input.tasks.map((task: ParsedInput, index: number) => ({
    id: String(index + 1), method: "POST", url: `/me/todo/lists/${listId}/tasks`, headers: { "Content-Type": "application/json" }, body: toGraphTaskPatch(task, true),
  })));
  return normalizeBatchResponses(responses);
}

async function batchUpdateTasks(accessToken: string, input: ParsedInput): Promise<unknown> {
  const listId = segment(input.list_id);
  const responses = await graphBatch(accessToken, input.tasks.map((task: ParsedInput, index: number) => ({
    id: String(index + 1), method: "PATCH", url: `/me/todo/lists/${listId}/tasks/${segment(task.task_id)}`,
    headers: removeUndefined({ "Content-Type": "application/json", "If-Match": task.expected_etag }),
    body: toGraphTaskPatch(task, false),
  })));
  return normalizeBatchResponses(responses);
}

async function batchCompleteTasks(accessToken: string, input: ParsedInput): Promise<unknown> {
  const listId = segment(input.list_id);
  const responses = await graphBatch(accessToken, input.task_ids.map((taskId: string, index: number) => ({
    id: String(index + 1), method: "PATCH", url: `/me/todo/lists/${listId}/tasks/${segment(taskId)}`,
    headers: { "Content-Type": "application/json" }, body: { status: "completed" },
  })));
  return normalizeBatchResponses(responses);
}

function normalizeBatchResponses(responses: Array<{ id: string; status: number; body?: unknown }>): unknown {
  const items = responses.map((response) => ({ id: response.id, ok: response.status >= 200 && response.status < 300, status: response.status, body: response.body }));
  return { items, all_succeeded: items.every((item) => item.ok) };
}

function taskPath(listId: string, taskId: string): string {
  return `/me/todo/lists/${segment(listId)}/tasks/${segment(taskId)}`;
}

function segment(value: string): string { return encodeURIComponent(value); }

function patch(body: unknown, expectedEtag?: string): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (expectedEtag) headers["If-Match"] = expectedEtag;
  return { method: "PATCH", headers, body: JSON.stringify(body) };
}

function removeUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function requireNonEmpty(value: Record<string, unknown>, label: string): void {
  if (Object.keys(value).length === 0) throw new Error(`At least one field is required for ${label}.`);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function result(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function formatTodoError(error: unknown): string {
  if (error instanceof GraphApiError) {
    const request = error.requestId ? ` [graph_request_id: ${error.requestId}]` : "";
    if (error.status === 429) return `Microsoft Graph rate limit reached: ${error.message}${request}`;
    if (error.status === 401 || error.status === 403) return `Microsoft To Do authorization is unavailable: ${error.message}${request}`;
    if (error.status === 412) return `Microsoft To Do item changed since it was read. Re-read it before updating.${request}`;
    return `Microsoft Graph error ${error.code ? `(${error.code}) ` : ""}(HTTP ${error.status}): ${error.message}${request}`;
  }
  return error instanceof Error ? error.message : "Unknown ms-todo-mcp error.";
}
