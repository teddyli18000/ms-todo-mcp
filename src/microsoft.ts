import type { MicrosoftIdentity, StoredMicrosoftTokens } from "./types";

const AUTHORIZE_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MICROSOFT_OAUTH_SCOPE = "openid profile offline_access Tasks.ReadWrite";

export function buildMicrosoftAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPE);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeMicrosoftAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ tokens: StoredMicrosoftTokens; identity: MicrosoftIdentity }> {
  const payload = await tokenRequest({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    scope: MICROSOFT_OAUTH_SCOPE,
  });
  if (!payload.refresh_token) throw new Error("Microsoft did not return a refresh token. Reconnect and grant offline access.");
  if (!payload.id_token) throw new Error("Microsoft did not return an ID token.");
  return {
    tokens: normalizeTokens(payload, payload.refresh_token),
    identity: identityFromIdToken(payload.id_token),
  };
}

export async function refreshMicrosoftTokens(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<StoredMicrosoftTokens> {
  const payload = await tokenRequest({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
    scope: MICROSOFT_OAUTH_SCOPE,
  });
  return normalizeTokens(payload, payload.refresh_token ?? input.refreshToken);
}

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(fields: Record<string, string>): Promise<TokenPayload> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const payload = (await response.json()) as TokenPayload;
  if (!response.ok || payload.error) {
    const detail = sanitizeOAuthError(payload.error_description ?? payload.error ?? `HTTP ${response.status}`);
    throw new Error(`Microsoft OAuth failed: ${detail}`);
  }
  if (!payload.access_token || !Number.isFinite(payload.expires_in)) {
    throw new Error("Microsoft OAuth returned an incomplete token response.");
  }
  return payload;
}

function normalizeTokens(payload: TokenPayload, refreshToken: string): StoredMicrosoftTokens {
  if (!payload.access_token || !Number.isFinite(payload.expires_in)) {
    throw new Error("Microsoft OAuth returned an incomplete token response.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken,
    accessTokenExpiresAt: Date.now() + Number(payload.expires_in) * 1000,
    scope: payload.scope ?? MICROSOFT_OAUTH_SCOPE,
  };
}

function identityFromIdToken(idToken: string): MicrosoftIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("Microsoft ID token was malformed.");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as Record<string, unknown>;
  } catch {
    throw new Error("Microsoft ID token claims could not be decoded.");
  }
  const sub = typeof claims.sub === "string" ? claims.sub : undefined;
  const issuer = typeof claims.iss === "string" ? claims.iss : "microsoft";
  if (!sub) throw new Error("Microsoft ID token did not contain a stable subject.");
  return {
    userId: `${issuer}|${sub}`,
    displayName: typeof claims.name === "string" ? claims.name : undefined,
    username: typeof claims.preferred_username === "string" ? claims.preferred_username : undefined,
  };
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sanitizeOAuthError(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/(?:access_token|refresh_token)=[^\s&]+/gi, "$1=[REDACTED]").slice(0, 600);
}
