import { describe, expect, it } from "vitest";
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

  it("requires a title when creating a task", () => {
    expect(schemas.create_task.safeParse({ list_id: "list" }).success).toBe(false);
  });
});
