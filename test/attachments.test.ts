import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadTaskAttachment } from "../src/attachment-service";

afterEach(() => vi.unstubAllGlobals());

describe("Microsoft To Do attachment upload", () => {
  it("creates an upload session and finishes with PUT without any delete call", async () => {
    const requests: Array<{ url: string; method: string; headers: Headers }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      requests.push({ url, method, headers });
      if (url.endsWith("/attachments/createUploadSession")) {
        return Response.json({
          uploadUrl: "https://graph.microsoft.com/v1.0/me/todo/lists/list/tasks/task/attachmentSessions/session",
          expirationDateTime: "2026-10-12T10:00:00Z",
          nextExpectedRanges: ["0-"],
        });
      }
      if (url.endsWith("/attachmentSessions/session/content")) {
        return new Response(null, {
          status: 201,
          headers: {
            Location: "https://graph.microsoft.com/v1.0/me/todo/lists/list/tasks/task/Attachments/attachment-123",
          },
        });
      }
      return new Response("not found", { status: 404 });
    }));

    const output = await uploadTaskAttachment("access-token", "list", "task", {
      fileId: "file-1",
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    });

    expect(output).toEqual({
      uploaded: true,
      attachment_id: "attachment-123",
      name: "notes.pdf",
      content_type: "application/pdf",
      size: 4,
    });
    expect(requests.map((request) => request.method)).toEqual(["POST", "PUT"]);
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
    expect(requests[1]?.headers.get("Content-Range")).toBe("bytes 0-3/4");
  });
});
