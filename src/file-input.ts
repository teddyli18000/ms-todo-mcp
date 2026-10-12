export const MAX_TASK_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_STREAM_CHUNKS = 16_384;

export type ChatGptFileReference = {
  file_id: string;
  download_url: string;
  file_name?: string;
  name?: string;
  mime_type?: string;
  size?: number;
};

export type PreparedTaskAttachment = {
  fileId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
};

export async function prepareTaskAttachment(value: unknown): Promise<PreparedTaskAttachment> {
  const reference = parseFileReference(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchFollowingSafeRedirects(reference.download_url, controller.signal);
    if (!response.ok) throw new Error(`ChatGPT file download failed with HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TASK_ATTACHMENT_BYTES) {
      throw new Error(`Microsoft To Do attachments are limited to ${MAX_TASK_ATTACHMENT_BYTES} bytes.`);
    }
    const bytes = await readBoundedBody(response, MAX_TASK_ATTACHMENT_BYTES);
    if (bytes.byteLength === 0) throw new Error("Attachment is empty.");
    return {
      fileId: reference.file_id,
      fileName: sanitizeFilename(reference.file_name ?? reference.name ?? "attachment.bin"),
      mimeType: normalizeMime(reference.mime_type ?? response.headers.get("Content-Type") ?? "application/octet-stream"),
      bytes,
    };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error(`ChatGPT file download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseFileReference(value: unknown): ChatGptFileReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Attachment must be a ChatGPT-authorized file object, not a filename, URL, or path string.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.file_id !== "string" || input.file_id.length < 3 || typeof input.download_url !== "string") {
    throw new Error("Attachment is missing ChatGPT file_id or download_url.");
  }
  validateDownloadUrl(new URL(input.download_url));
  const size = typeof input.size === "number" ? input.size : undefined;
  if (size !== undefined && (!Number.isFinite(size) || size <= 0 || size > MAX_TASK_ATTACHMENT_BYTES)) {
    throw new Error(`Attachment must be non-empty and no larger than ${MAX_TASK_ATTACHMENT_BYTES} bytes.`);
  }
  return {
    file_id: input.file_id,
    download_url: input.download_url,
    ...(typeof input.file_name === "string" ? { file_name: input.file_name } : {}),
    ...(typeof input.name === "string" ? { name: input.name } : {}),
    ...(typeof input.mime_type === "string" ? { mime_type: input.mime_type } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

async function fetchFollowingSafeRedirects(urlValue: string, signal: AbortSignal): Promise<Response> {
  let url = new URL(urlValue);
  for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
    validateDownloadUrl(url);
    const response = await fetch(url, { redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("Location");
    if (!location) throw new Error("Attachment redirect did not include a location.");
    url = new URL(location, url);
  }
  throw new Error("Attachment download exceeded the redirect limit.");
}

export async function readBoundedBody(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new Error(`Attachment exceeds ${maxBytes} bytes.`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (let count = 0; count <= MAX_STREAM_CHUNKS; count += 1) {
      const { done, value } = await reader.read();
      if (done) return combine(chunks, total);
      if (count === MAX_STREAM_CHUNKS) throw new Error("Attachment stream exceeded the safe chunk limit.");
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("attachment too large");
        throw new Error(`Attachment exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
    throw new Error("Attachment stream exceeded the safe chunk limit.");
  } finally {
    reader.releaseLock();
  }
}

function combine(chunks: Uint8Array[], total: number): ArrayBuffer {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

function validateDownloadUrl(url: URL): void {
  if (url.protocol !== "https:") throw new Error("ChatGPT file URL must use HTTPS.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  ) {
    throw new Error("ChatGPT file URL points to a local or private-looking destination.");
  }
}

function sanitizeFilename(value: string): string {
  const cleaned = value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim();
  return (cleaned || "attachment.bin").slice(0, 250);
}

function normalizeMime(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}
