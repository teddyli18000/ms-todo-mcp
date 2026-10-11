import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../src/tools";
import { schemas } from "../src/tool-schemas";

describe("tool safety boundary", () => {
  it("exposes no delete tool", () => {
    expect(TOOL_NAMES.some((name) => name.toLowerCase().includes("delete"))).toBe(false);
  });

  it("keeps a rich management surface", () => {
    expect(TOOL_NAMES.length).toBeGreaterThanOrEqual(24);
    expect(TOOL_NAMES).toContain("create_task");
    expect(TOOL_NAMES).toContain("update_task");
    expect(TOOL_NAMES).toContain("complete_task");
    expect(TOOL_NAMES).toContain("reopen_task");
    expect(TOOL_NAMES).toContain("summarize_tasks");
    expect(TOOL_NAMES).toContain("attach_file_to_task");
  });

  it("caps batch size at 20", () => {
    const parsed = schemas.batch_complete_tasks.safeParse({ list_id: "l", task_ids: Array.from({ length: 21 }, (_, i) => `t${i}`) });
    expect(parsed.success).toBe(false);
  });
});
