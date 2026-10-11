import { describe, expect, it } from "vitest";
import { decodeGraphCursor, encodeGraphCursor } from "../src/graph";

describe("Graph pagination cursor", () => {
  it("round-trips an allowed Graph nextLink", () => {
    const url = "https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks?$skiptoken=abc";
    const cursor = encodeGraphCursor(url);
    expect(cursor).toBeTruthy();
    expect(decodeGraphCursor(cursor!, "/me/todo/lists/list1/tasks")).toBe(url);
  });

  it("rejects a cursor for another resource", () => {
    const cursor = encodeGraphCursor("https://graph.microsoft.com/v1.0/me/messages?$skiptoken=x")!;
    expect(() => decodeGraphCursor(cursor, "/me/todo/lists/list1/tasks")).toThrow();
  });
});
