import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { buildMicrosoftAuthorizeUrl, exchangeMicrosoftAuthorizationCode } from "./microsoft";
import { consumeOAuthState, createOAuthState } from "./oauth-state";
import { getMicrosoftRuntimeConfig, isMicrosoftRuntimeConfigured } from "./runtime-config";
import type { ConnectorProps } from "./types";
import { CONNECTOR_VERSION } from "./version";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/", (c) => {
  const configured = isMicrosoftRuntimeConfigured(c.env);
  return c.json(
    { name: "ms-todo-mcp", version: CONNECTOR_VERSION, status: configured ? "ok" : "misconfigured", mcp: "/mcp" },
    configured ? 200 : 503,
    { "Cache-Control": "no-store" },
  );
});
app.get("/health", (c) => {
  const configured = isMicrosoftRuntimeConfigured(c.env);
  return c.json(
    { ok: configured, version: CONNECTOR_VERSION, microsoft_oauth_configured: configured },
    configured ? 200 : 503,
    { "Cache-Control": "no-store" },
  );
});

app.get("/authorize", async (c) => {
  try {
    const config = getMicrosoftRuntimeConfig(c.env);
    const authRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    if (!authRequest.clientId) return c.text("Invalid OAuth client.", 400);
    const { state, setCookie, oidcNonce, codeChallenge } = await createOAuthState(authRequest, c.env.MICROSOFT_OAUTH_STATE);
    const redirectUri = new URL("/oauth/microsoft/callback", c.req.url).toString();
    const authorizeUrl = buildMicrosoftAuthorizeUrl({
      clientId: config.clientId,
      redirectUri,
      state,
      oidcNonce,
      codeChallenge,
    });
    return new Response(null, { status: 302, headers: { Location: authorizeUrl, "Set-Cookie": setCookie, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Microsoft OAuth authorization start failed", safeError(error));
    return c.text("Unable to start Microsoft authorization.", 500);
  }
});

app.get("/oauth/microsoft/callback", async (c) => {
  const upstreamError = c.req.query("error");
  if (upstreamError) return c.text(`Microsoft authorization was not completed: ${safeQueryText(upstreamError)}`, 400);
  try {
    const config = getMicrosoftRuntimeConfig(c.env);
    const { authRequest, clearCookie, oidcNonce, codeVerifier } = await consumeOAuthState(c.req.raw, c.env.MICROSOFT_OAUTH_STATE);
    if (!authRequest.clientId) return c.text("Invalid OAuth request.", 400);
    const code = c.req.query("code");
    if (!code) return c.text("Microsoft did not return an authorization code.", 400);
    const redirectUri = new URL("/oauth/microsoft/callback", c.req.url).toString();
    const { tokens, identity } = await exchangeMicrosoftAuthorizationCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri,
      codeVerifier,
      expectedNonce: oidcNonce,
    });
    const vault = c.env.MICROSOFT_TOKEN_VAULT.get(c.env.MICROSOFT_TOKEN_VAULT.idFromName(identity.userId));
    const stored = await vault.fetch("https://token-vault/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens),
    });
    if (!stored.ok) throw new Error("Failed to persist Microsoft OAuth credentials.");
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: authRequest,
      userId: identity.userId,
      metadata: { label: identity.displayName ?? identity.username ?? "Microsoft To Do user" },
      scope: authRequest.scope,
      props: { userId: identity.userId, displayName: identity.displayName, username: identity.username } satisfies ConnectorProps,
      revokeExistingGrants: false,
    });
    return new Response(null, { status: 302, headers: { Location: redirectTo, "Set-Cookie": clearCookie, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Microsoft OAuth callback failed", safeError(error));
    return c.text("Microsoft authorization failed. Reconnect the plugin and try again.", 500);
  }
});

function safeQueryText(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error")
    .replace(/(access_token|refresh_token|client_secret|code_verifier)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 800);
}

export { app as MicrosoftOAuthHandler };
