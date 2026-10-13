import { validateMicrosoftIdToken } from "./oidc";
import type { MicrosoftIdentity, StoredMicrosoftTokens } from "./types";

const AUTHORIZE_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const TOKEN_TIMEOUT_MS = 20_000;
export const MICROSOFT_OAUTH_SCOPE = "openid profile offline_access Tasks.ReadWrite";

export function buildMicrosoftAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  oidcNonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.oidcNonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeMicrosoftAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  expectedNonce: string;
}): Promise<{ tokens: StoredMicrosoftTokens; identity: MicrosoftIdentity }> {
  const payload = await tokenRequest({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    scope: MICROSOFT_OAUTH_SCOPE,
  });
  if (!payload.refresh_token) throw new Error("Microsoft did not return a refresh token. Reconnect and grant offline access.");
  if (!payload.id_token) throw new Error("Microsoft did not return an ID token.");
  return {
    tokens: normalizeTokens(payload, payload.refresh_token),
    identity: await validateMicrosoftIdToken({
      idToken: payload.id_token,
      clientId: input.clientId,
      expectedNonce: input.expectedNonce,
    }),
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(fields),
      signal: controller.signal,
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
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error("Microsoft OAuth token request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

function sanitizeOAuthError(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/(access_token|refresh_token|client_secret|code_verifier)=[^\s&]+/gi, "$1=[REDACTED]")
    .slice(0, 600);
}
