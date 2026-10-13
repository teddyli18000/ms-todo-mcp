import { describe, expect, it } from "vitest";
import { mergeProtectedTaskNote } from "../src/gpt-notes";
import { GPT_NOTE_MARKER } from "../src/model-guidance";

describe("GPT collaboration note ownership", () => {
  it("preserves the exact user prefix when GPT rewrites its workspace", () => {
    const existing = `my note\n\n${GPT_NOTE_MARKER}\n状态：旧`;
    const proposed = `should not replace me\n\n${GPT_NOTE_MARKER}\n状态：新`;
    expect(mergeProtectedTaskNote(existing, proposed)).toBe(`my note\n\n${GPT_NOTE_MARKER}\n状态：新`);
  });

  it("appends a first GPT region after an existing ordinary note", () => {
    const merged = mergeProtectedTaskNote("keep this", `${GPT_NOTE_MARKER}\n状态：进行中`);
    expect(merged).toBe(`keep this\n\n\n${GPT_NOTE_MARKER}\n状态：进行中`);
  });

  it("keeps an agent-provided separator when the user prefix is unchanged", () => {
    const proposed = `keep this\n\n\n${GPT_NOTE_MARKER}\n状态：进行中`;
    expect(mergeProtectedTaskNote("keep this", proposed)).toBe(proposed);
  });

  it("leaves ordinary notes unchanged by the collaboration protocol", () => {
    expect(mergeProtectedTaskNote("old ordinary note", "new ordinary note")).toBe("new ordinary note");
  });

  it("rejects dropping the marker from an existing GPT ticket", () => {
    expect(() => mergeProtectedTaskNote(`${GPT_NOTE_MARKER}\n状态：进行中`, "replacement"))
      .toThrow(/retain/);
  });
});
