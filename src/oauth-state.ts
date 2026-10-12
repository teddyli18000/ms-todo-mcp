import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

const STATE_COOKIE_PREFIX = "__Host-MS_TODO_MCP_STATE_";
const STATE_TTL_SECONDS = 600;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OAuthStateResponse = {
  ok?: boolean;
  authRequest?: AuthRequest;
  oidcNonce?: string;
  codeVerifier?: string;
  error?: string;
};

export async function createOAuthState(
  request: AuthRequest,
  namespace: DurableObjectNamespace,
): Promise<{ state: string; setCookie: string; oidcNonce: string; codeChallenge: string }> {
  const state = crypto.randomUUID();
  const browserNonce = randomHex(32);
  const browserNonceDigest = await sha256Hex(browserNonce);
  const oidcNonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const response = await stateStub(namespace, state).fetch("https://oauth-state/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ authRequest: request, browserNonceDigest, oidcNonce, codeVerifier }),
  });
  if (!response.ok) throw new Error("Failed to initialize OAuth state.");
  return {
    state,
    oidcNonce,
    codeChallenge,
    setCookie: `${stateCookieName(state)}=${browserNonce}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`,
  };
}

export async function consumeOAuthState(
  request: Request,
  namespace: DurableObjectNamespace,
): Promise<{ authRequest: AuthRequest; clearCookie: string; oidcNonce: string; codeVerifier: string }> {
  const state = new URL(request.url).searchParams.get("state");
  if (!state) throw new Error("Missing OAuth state.");
  validateState(state);
  const cookieName = stateCookieName(state);
  const receivedNonce = readCookie(request, cookieName);
  if (!receivedNonce) throw new Error("OAuth browser session validation failed.");
  const response = await stateStub(namespace, state).fetch("https://oauth-state/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ browserNonceDigest: await sha256Hex(receivedNonce) }),
  });
  const payload = (await response.json()) as OAuthStateResponse;
  if (!response.ok || !payload.authRequest || !payload.oidcNonce || !payload.codeVerifier) {
    if (payload.error === "browser_session_mismatch") throw new Error("OAuth browser session validation failed.");
    throw new Error("OAuth state is invalid or expired.");
  }
  return {
    authRequest: payload.authRequest,
    oidcNonce: payload.oidcNonce,
    codeVerifier: payload.codeVerifier,
    clearCookie: `${cookieName}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`,
  };
}

function stateStub(namespace: DurableObjectNamespace, state: string): DurableObjectStub {
  validateState(state);
  return namespace.get(namespace.idFromName(state));
}

function stateCookieName(state: string): string {
  validateState(state);
  return `${STATE_COOKIE_PREFIX}${state}`;
}

function validateState(state: string): void {
  if (!UUID_PATTERN.test(state)) throw new Error("OAuth state is invalid or expired.");
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomBase64Url(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
