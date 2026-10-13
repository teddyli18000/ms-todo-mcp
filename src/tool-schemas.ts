import { z } from "zod";
import { MAX_TASK_ATTACHMENT_BYTES } from "./file-input";

export const id = z.string().min(1).max(1024);
const title = z.string().min(1).max(1024);
const category = z.string().min(1).max(255);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Calendar date in YYYY-MM-DD format.");

export const dateTimeTimeZone = z.strictObject({
  dateTime: z.string().min(1).max(64).describe("Microsoft Graph date-time string, for example 2026-10-15T17:00:00.0000000."),
  timeZone: z.string().min(1).max(128).describe("Microsoft/Windows or supported IANA time-zone name accepted by Graph."),
});

const dayOfWeek = z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
const recurrencePattern = z.strictObject({
  type: z.enum(["daily", "weekly", "absoluteMonthly", "relativeMonthly", "absoluteYearly", "relativeYearly"]),
  interval: z.number().int().min(1).max(999),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  daysOfWeek: z.array(dayOfWeek).min(1).max(7).optional(),
  firstDayOfWeek: dayOfWeek.optional(),
  index: z.enum(["first", "second", "third", "fourth", "last"]).optional(),
  month: z.number().int().min(1).max(12).optional(),
}).superRefine((value, ctx) => {
  if (value.type === "weekly" && !value.daysOfWeek) issue(ctx, "daysOfWeek is required for weekly recurrence.", ["daysOfWeek"]);
  if (value.type === "absoluteMonthly" && value.dayOfMonth === undefined) issue(ctx, "dayOfMonth is required for absoluteMonthly recurrence.", ["dayOfMonth"]);
  if (value.type === "relativeMonthly") {
    if (!value.daysOfWeek) issue(ctx, "daysOfWeek is required for relativeMonthly recurrence.", ["daysOfWeek"]);
    if (!value.index) issue(ctx, "index is required for relativeMonthly recurrence.", ["index"]);
  }
  if (value.type === "absoluteYearly") {
    if (value.month === undefined) issue(ctx, "month is required for absoluteYearly recurrence.", ["month"]);
    if (value.dayOfMonth === undefined) issue(ctx, "dayOfMonth is required for absoluteYearly recurrence.", ["dayOfMonth"]);
  }
  if (value.type === "relativeYearly") {
    if (value.month === undefined) issue(ctx, "month is required for relativeYearly recurrence.", ["month"]);
    if (!value.daysOfWeek) issue(ctx, "daysOfWeek is required for relativeYearly recurrence.", ["daysOfWeek"]);
    if (!value.index) issue(ctx, "index is required for relativeYearly recurrence.", ["index"]);
  }
});

const recurrenceRange = z.strictObject({
  type: z.enum(["endDate", "noEnd", "numbered"]),
  startDate: date,
  endDate: date.optional(),
  numberOfOccurrences: z.number().int().min(1).max(9999).optional(),
  recurrenceTimeZone: z.string().min(1).max(128).optional(),
}).superRefine((value, ctx) => {
  if (value.type === "endDate" && !value.endDate) issue(ctx, "endDate is required for an endDate recurrence range.", ["endDate"]);
  if (value.type === "numbered" && value.numberOfOccurrences === undefined) {
    issue(ctx, "numberOfOccurrences is required for a numbered recurrence range.", ["numberOfOccurrences"]);
  }
});

export const recurrence = z.strictObject({ pattern: recurrencePattern, range: recurrenceRange });

export const mutableTaskFields = {
  body: z.string().max(1024 * 1024).optional().describe("Task notes/body as plain text."),
  categories: z.array(category).max(25).optional(),
  dueDateTime: dateTimeTimeZone.nullable().optional(),
  startDateTime: dateTimeTimeZone.nullable().optional(),
  reminderDateTime: dateTimeTimeZone.nullable().optional(),
  isReminderOn: z.boolean().optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
  status: z.enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"]).optional(),
  recurrence: recurrence.nullable().optional(),
} as const;

export const chatGptFile = z.strictObject({
  file_id: z.string().min(3),
  download_url: z.string().url(),
  file_name: z.string().max(250).optional(),
  name: z.string().max(250).optional(),
  mime_type: z.string().max(255).optional(),
  size: z.number().int().positive().max(MAX_TASK_ATTACHMENT_BYTES).optional(),
});

export const schemas = {
  get_todo_capabilities: z.strictObject({}),
  list_task_lists: z.strictObject({ limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(8192).optional() }),
  get_task_list: z.strictObject({ list_id: id }),
  list_tasks: z.strictObject({
    list_id: id,
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(8192).optional(),
    include_completed: z.boolean().default(false),
    status: z.enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"]).optional(),
  }),
  get_task: z.strictObject({ list_id: id, task_id: id }),
  search_tasks: z.strictObject({
    query: z.string().min(1).max(5000),
    include_completed: z.boolean().default(false),
    max_results: z.number().int().min(1).max(100).default(25),
  }),
  summarize_tasks: z.strictObject({
    today: date.optional().describe("User-local date. Pass this when timezone matters."),
    days_ahead: z.number().int().min(1).max(90).default(7),
    include_completed: z.boolean().default(false),
    max_tasks_per_list: z.number().int().min(1).max(200).default(100),
    max_items_per_bucket: z.number().int().min(1).max(100).default(25).describe("Maximum returned items in each summary bucket; total counts are still reported."),
  }),
  list_checklist_items: z.strictObject({ list_id: id, task_id: id }),
  list_linked_resources: z.strictObject({ list_id: id, task_id: id }),
  list_task_attachments: z.strictObject({ list_id: id, task_id: id }),
  create_task_list: z.strictObject({ display_name: z.string().min(1).max(255) }),
  rename_task_list: z.strictObject({ list_id: id, display_name: z.string().min(1).max(255), expected_etag: z.string().min(1).max(1024).optional() }),
  create_task: z.strictObject({ list_id: id, title, ...mutableTaskFields }),
  update_task: z.strictObject({ list_id: id, task_id: id, expected_etag: z.string().min(1).max(1024).optional(), title: title.optional(), ...mutableTaskFields }),
  complete_task: z.strictObject({ list_id: id, task_id: id, expected_etag: z.string().min(1).max(1024).optional() }),
  reopen_task: z.strictObject({ list_id: id, task_id: id, expected_etag: z.string().min(1).max(1024).optional() }),
  create_checklist_item: z.strictObject({ list_id: id, task_id: id, display_name: z.string().min(1).max(1024), is_checked: z.boolean().default(false) }),
  update_checklist_item: z.strictObject({ list_id: id, task_id: id, checklist_item_id: id, display_name: z.string().min(1).max(1024).optional(), is_checked: z.boolean().optional() }),
  create_linked_resource: z.strictObject({
    list_id: id,
    task_id: id,
    web_url: z.string().url().max(4096).optional(),
    application_name: z.string().min(1).max(255),
    display_name: z.string().min(1).max(1024),
    external_id: z.string().min(1).max(1024).optional(),
  }),
  update_linked_resource: z.strictObject({
    list_id: id,
    task_id: id,
    linked_resource_id: id,
    web_url: z.string().url().max(4096).optional(),
    application_name: z.string().min(1).max(255).optional(),
    display_name: z.string().min(1).max(1024).optional(),
    external_id: z.string().min(1).max(1024).optional(),
  }),
  attach_file_to_task: z.strictObject({ list_id: id, task_id: id, file: chatGptFile }),
  batch_create_tasks: z.strictObject({
    list_id: id,
    tasks: z.array(z.strictObject({ title, ...mutableTaskFields })).min(1).max(20),
  }),
  batch_update_tasks: z.strictObject({
    list_id: id,
    tasks: z.array(z.strictObject({ task_id: id, expected_etag: z.string().min(1).max(1024).optional(), title: title.optional(), ...mutableTaskFields })).min(1).max(20),
  }),
  batch_complete_tasks: z.strictObject({
    list_id: id,
    task_ids: z.array(id).min(1).max(20),
  }),
} as const;

export type ToolName = keyof typeof schemas;
export const TOOL_NAMES = Object.keys(schemas) as ToolName[];

function issue(ctx: z.RefinementCtx, message: string, path: PropertyKey[]): void {
  ctx.addIssue({ code: "custom", message, path });
}
