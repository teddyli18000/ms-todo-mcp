import { graphJson } from "./graph";
import type { PreparedTaskAttachment } from "./file-input";

const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 20_000;

type UploadSession = {
  uploadUrl?: string;
  expirationDateTime?: string;
  nextExpectedRanges?: string[];
};

export async function uploadTaskAttachment(
  accessToken: string,
  listId: string,
  taskId: string,
  attachment: PreparedTaskAttachment,
): Promise<{ uploaded: true; attachment_id?: string; name: string; content_type: string; size: number }> {
  const session = await graphJson<UploadSession>(
    accessToken,
    `/me/todo/lists/${segment(listId)}/tasks/${segment(taskId)}/attachments/createUploadSession`,
    {
      method: "POST",
      body: JSON.stringify({
        attachmentInfo: {
          attachmentType: "file",
          name: attachment.fileName,
          size: attachment.bytes.byteLength,
        },
      }),
    },
  );
  if (!session.uploadUrl) throw new Error("Microsoft Graph did not return an attachment upload URL.");
  const contentUrl = validateAndBuildContentUrl(session.uploadUrl);
  const bytes = new Uint8Array(attachment.bytes);
  let finalLocation: string | undefined;

  for (let start = 0; start < bytes.byteLength; start += UPLOAD_CHUNK_BYTES) {
    const endExclusive = Math.min(start + UPLOAD_CHUNK_BYTES, bytes.byteLength);
    const chunk = bytes.subarray(start, endExclusive);
    const isFinal = endExclusive === bytes.byteLength;
    const response = await uploadChunk(accessToken, contentUrl, chunk, start, endExclusive - 1, bytes.byteLength);
    if (isFinal) {
      if (response.status !== 201) throw new Error(`Microsoft To Do attachment final upload failed with HTTP ${response.status}.`);
      finalLocation = response.headers.get("Location") ?? undefined;
    } else if (response.status !== 200) {
      throw new Error(`Microsoft To Do attachment upload failed with HTTP ${response.status}.`);
    }
  }

  return {
    uploaded: true,
    ...(finalLocation ? { attachment_id: attachmentIdFromLocation(finalLocation) } : {}),
    name: attachment.fileName,
    content_type: attachment.mimeType,
    size: attachment.bytes.byteLength,
  };
}

async function uploadChunk(
  accessToken: string,
  url: string,
  chunk: Uint8Array,
  start: number,
  end: number,
  total: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const body = new Uint8Array(chunk.byteLength);
    body.set(chunk);
    return await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body: body.buffer,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error(`Microsoft To Do attachment upload timed out after ${UPLOAD_TIMEOUT_MS / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function validateAndBuildContentUrl(uploadUrl: string): string {
  const url = new URL(uploadUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "graph.microsoft.com" ||
    !url.pathname.startsWith("/v1.0/") ||
    !url.pathname.includes("/attachmentSessions/")
  ) {
    throw new Error("Microsoft Graph returned an unexpected attachment upload URL.");
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/content`;
  return url.toString();
}

function attachmentIdFromLocation(location: string): string | undefined {
  try {
    const url = new URL(location);
    if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com") return undefined;
    const marker = "/attachments/";
    const lower = url.pathname.toLowerCase();
    const index = lower.lastIndexOf(marker);
    if (index < 0) return undefined;
    const encoded = url.pathname.slice(index + marker.length);
    return encoded ? decodeURIComponent(encoded) : undefined;
  } catch {
    return undefined;
  }
}

function segment(value: string): string {
  return encodeURIComponent(value);
}
