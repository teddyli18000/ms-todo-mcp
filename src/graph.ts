const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 20_000;

export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

export async function graphJson<T>(
  accessToken: string,
  pathOrUrl: string,
  init: RequestInit = {},
): Promise<T> {
  const url = normalizeGraphUrl(pathOrUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw await graphError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Microsoft Graph request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function encodeGraphCursor(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined;
  const url = normalizeGraphUrl(nextLink);
  return base64UrlEncode(new TextEncoder().encode(url));
}

export function decodeGraphCursor(cursor: string, expectedPath: string): string {
  let value: string;
  try { value = new TextDecoder().decode(base64UrlDecode(cursor)); } catch { throw new Error("Invalid pagination cursor."); }
  const url = new URL(normalizeGraphUrl(value));
  if (url.pathname !== `/v1.0${expectedPath}`) throw new Error("Pagination cursor does not belong to this resource.");
  return url.toString();
}

export async function graphBatch<T extends { id: string; status: number; body?: unknown }>(
  accessToken: string,
  requests: Array<{ id: string; method: string; url: string; headers?: Record<string, string>; body?: unknown }>,
): Promise<T[]> {
  if (requests.length === 0 || requests.length > 20) throw new Error("Microsoft Graph batch size must be between 1 and 20.");
  const payload = await graphJson<{ responses: T[] }>(accessToken, "/$batch", {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  return payload.responses;
}

function normalizeGraphUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("/")) return `${GRAPH_ROOT}${pathOrUrl}`;
  const url = new URL(pathOrUrl);
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com" || !url.pathname.startsWith("/v1.0/")) {
    throw new Error("Refused non-Microsoft-Graph URL.");
  }
  return url.toString();
}

async function graphError(response: Response): Promise<GraphApiError> {
  let code: string | undefined;
  let message = `Microsoft Graph request failed with HTTP ${response.status}.`;
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string; innerError?: { "request-id"?: string; requestId?: string } } };
    code = payload.error?.code;
    if (payload.error?.message) message = payload.error.message;
    const requestId = payload.error?.innerError?.["request-id"] ?? payload.error?.innerError?.requestId ?? response.headers.get("request-id") ?? undefined;
    return new GraphApiError(response.status, code, message, requestId);
  } catch {
    return new GraphApiError(response.status, code, message, response.headers.get("request-id") ?? undefined);
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
