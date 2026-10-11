import { afterEach, describe, expect, it, vi } from "vitest";
import { validateMicrosoftIdToken } from "../src/oidc";

const CLIENT_ID = "11111111-2222-4333-8444-555555555555";
const TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const NONCE = "expected-nonce";

afterEach(() => vi.unstubAllGlobals());

describe("Microsoft ID token validation", () => {
  it("verifies signature, audience, issuer and nonce", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const token = await signJwt(keyPair.privateKey, {
      aud: CLIENT_ID,
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      tid: TENANT_ID,
      oid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      sub: "subject",
      nonce: NONCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: Math.floor(Date.now() / 1000) - 30,
      iat: Math.floor(Date.now() / 1000) - 30,
      ver: "2.0",
      name: "Test User",
      preferred_username: "test@example.com",
    });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("openid-configuration")) {
        return Response.json({ jwks_uri: "https://login.microsoftonline.com/common/discovery/v2.0/keys" });
      }
      if (url.includes("/keys")) {
        return Response.json({ keys: [{ ...publicJwk, kid: "test-key", use: "sig", alg: "RS256", issuer: "https://login.microsoftonline.com/{tenantid}/v2.0" }] });
      }
      return new Response("not found", { status: 404 });
    }));

    await expect(validateMicrosoftIdToken({ idToken: token, clientId: CLIENT_ID, expectedNonce: NONCE })).resolves.toEqual({
      userId: `${TENANT_ID}|aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`,
      displayName: "Test User",
      username: "test@example.com",
    });
  });

  it("rejects a nonce mismatch before accepting identity", async () => {
    const header = encodeJson({ alg: "RS256", kid: "test-key", typ: "JWT" });
    const claims = encodeJson({
      aud: CLIENT_ID,
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      tid: TENANT_ID,
      sub: "subject",
      nonce: "wrong",
      exp: Math.floor(Date.now() / 1000) + 3600,
      ver: "2.0",
    });
    const token = `${header}.${claims}.${base64Url(new Uint8Array([1, 2, 3]))}`;
    await expect(validateMicrosoftIdToken({ idToken: token, clientId: CLIENT_ID, expectedNonce: NONCE })).rejects.toThrow(/nonce/i);
  });
});

async function signJwt(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  const header = encodeJson({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const payload = encodeJson(claims);
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
