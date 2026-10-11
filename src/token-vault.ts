import { DurableObject } from "cloudflare:workers";
import { refreshMicrosoftTokens } from "./microsoft";
import { SingleFlight } from "./single-flight";
import type { StoredMicrosoftTokens } from "./types";

const TOKEN_STORAGE_KEY = "microsoft_tokens";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export class MicrosoftTokenVault extends DurableObject<Env> {
  private readonly refreshFlight = new SingleFlight<StoredMicrosoftTokens>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/initialize") {
      const tokens = (await request.json()) as StoredMicrosoftTokens;
      validateStoredTokens(tokens);
      await this.ctx.storage.put(TOKEN_STORAGE_KEY, tokens);
      return json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/access-token") {
      try {
        return json({ accessToken: await this.getValidAccessToken() });
      } catch (error) {
        return json({ error: "reauthorization_required", message: safeMessage(error) }, 401);
      }
    }
    return json({ error: "not_found" }, 404);
  }

  private async getValidAccessToken(): Promise<string> {
    const tokens = await this.ctx.storage.get<StoredMicrosoftTokens>(TOKEN_STORAGE_KEY);
    if (!tokens) throw new Error("No Microsoft OAuth credentials are stored for this user.");
    if (isAccessTokenFresh(tokens)) return tokens.accessToken;
    await this.refreshFlight.run(() => this.refreshLatestStoredTokens());
    const latest = await this.ctx.storage.get<StoredMicrosoftTokens>(TOKEN_STORAGE_KEY);
    if (!latest) throw new Error("No Microsoft OAuth credentials are stored for this user.");
    return latest.accessToken;
  }

  private async refreshLatestStoredTokens(): Promise<StoredMicrosoftTokens> {
    const source = await this.ctx.storage.get<StoredMicrosoftTokens>(TOKEN_STORAGE_KEY);
    if (!source) throw new Error("No Microsoft OAuth credentials are stored for this user.");
    if (isAccessTokenFresh(source)) return source;
    const refreshed = await refreshMicrosoftTokens({
      clientId: this.env.MICROSOFT_CLIENT_ID,
      clientSecret: this.env.MICROSOFT_CLIENT_SECRET,
      refreshToken: source.refreshToken,
    });
    const current = await this.ctx.storage.get<StoredMicrosoftTokens>(TOKEN_STORAGE_KEY);
    if (!current) throw new Error("Microsoft OAuth credentials disappeared while refreshing.");
    if (current.refreshToken !== source.refreshToken) return current;
    await this.ctx.storage.put(TOKEN_STORAGE_KEY, refreshed);
    return refreshed;
  }
}

function isAccessTokenFresh(tokens: StoredMicrosoftTokens): boolean {
  return tokens.accessTokenExpiresAt - ACCESS_TOKEN_REFRESH_SKEW_MS > Date.now();
}

function validateStoredTokens(tokens: StoredMicrosoftTokens): void {
  if (!tokens.accessToken || !tokens.refreshToken || !Number.isFinite(tokens.accessTokenExpiresAt) || !tokens.scope) {
    throw new Error("Invalid Microsoft token set.");
  }
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Microsoft authorization is unavailable.")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access_token|refresh_token)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 800);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
