import { DurableObject } from "cloudflare:workers";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

const STORAGE_KEY = "oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

type StoredOAuthState = {
  authRequest: AuthRequest;
  browserNonceDigest: string;
  oidcNonce: string;
  codeVerifier: string;
  expiresAt: number;
};

export class MicrosoftOAuthStateVault extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/initialize") {
      let body: Partial<Omit<StoredOAuthState, "expiresAt">>;
      try { body = (await request.json()) as typeof body; } catch { return json({ error: "invalid_request" }, 400); }
      if (
        !body.authRequest ||
        !isSha256Hex(body.browserNonceDigest) ||
        !isBase64UrlSecret(body.oidcNonce, 32, 128) ||
        !isBase64UrlSecret(body.codeVerifier, 43, 128)
      ) {
        return json({ error: "invalid_request" }, 400);
      }
      const stored: StoredOAuthState = {
        authRequest: body.authRequest,
        browserNonceDigest: body.browserNonceDigest,
        oidcNonce: body.oidcNonce,
        codeVerifier: body.codeVerifier,
        expiresAt: Date.now() + STATE_TTL_MS,
      };
      await this.ctx.storage.put(STORAGE_KEY, stored);
      await this.ctx.storage.setAlarm(stored.expiresAt);
      return json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/consume") {
      let body: Partial<{ browserNonceDigest: string }>;
      try { body = (await request.json()) as typeof body; } catch { return json({ error: "invalid_request" }, 400); }
      if (!isSha256Hex(body.browserNonceDigest)) return json({ error: "invalid_request" }, 400);
      const stored = await this.ctx.storage.get<StoredOAuthState>(STORAGE_KEY);
      if (!stored || stored.expiresAt <= Date.now()) {
        await this.clear();
        return json({ error: "invalid_or_expired" }, 410);
      }
      if (!timingSafeEqual(stored.browserNonceDigest, body.browserNonceDigest)) {
        return json({ error: "browser_session_mismatch" }, 403);
      }
      await this.clear();
      return json({
        ok: true,
        authRequest: stored.authRequest,
        oidcNonce: stored.oidcNonce,
        codeVerifier: stored.codeVerifier,
      });
    }
    return json({ error: "not_found" }, 404);
  }

  override async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }

  private async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm().catch(() => undefined);
  }
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isBase64UrlSecret(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === "string" && value.length >= minLength && value.length <= maxLength && BASE64URL.test(value);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
