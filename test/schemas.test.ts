import { describe, expect, it } from "vitest";
import { MAX_TASK_ATTACHMENT_BYTES } from "../src/file-input";
import { schemas } from "../src/tool-schemas";

describe("task schemas", () => {
  it("accepts due date, reminder, notes and recurrence", () => {
    const parsed = schemas.create_task.safeParse({
      list_id: "list",
      title: "Submit assignment",
      body: "Check figures before submitting.",
      dueDateTime: { dateTime: "2026-10-15T23:59:00", timeZone: "China Standard Time" },
      isReminderOn: true,
      reminderDateTime: { dateTime: "2026-10-15T21:00:00", timeZone: "China Standard Time" },
      recurrence: {
        pattern: { type: "weekly", interval: 1, daysOfWeek: ["monday"], firstDayOfWeek: "monday" },
        range: { type: "noEnd", startDate: "2026-10-12", recurrenceTimeZone: "China Standard Time" },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("requires recurrence fields implied by the selected pattern and range", () => {
    const parsed = schemas.create_task.safeParse({
      list_id: "list",
      title: "Monthly review",
      recurrence: {
        pattern: { type: "absoluteMonthly", interval: 1 },
        range: { type: "endDate", startDate: "2026-10-12" },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a title when creating a task", () => {
    expect(schemas.create_task.safeParse({ list_id: "list" }).success).toBe(false);
  });

  it("bounds ChatGPT task attachments to 25 MiB", () => {
    const base = {
      list_id: "list",
      task_id: "task",
      file: { file_id: "file-1", download_url: "https://example.com/file.bin" },
    };
    expect(schemas.attach_file_to_task.safeParse({ ...base, file: { ...base.file, size: MAX_TASK_ATTACHMENT_BYTES } }).success).toBe(true);
    expect(schemas.attach_file_to_task.safeParse({ ...base, file: { ...base.file, size: MAX_TASK_ATTACHMENT_BYTES + 1 } }).success).toBe(false);
  });
});
