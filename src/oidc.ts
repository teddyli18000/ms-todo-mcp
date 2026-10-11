import type { MicrosoftIdentity } from "./types";

const OIDC_CONFIG_URL = "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration";
const OIDC_FETCH_TIMEOUT_MS = 10_000;
const CLOCK_SKEW_SECONDS = 5 * 60;
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type IdTokenClaims = {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  tid?: unknown;
  oid?: unknown;
  nonce?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  ver?: unknown;
  name?: unknown;
  preferred_username?: unknown;
};
type OpenIdConfiguration = { jwks_uri?: string };
type MicrosoftJwk = JsonWebKey & { kid?: string; issuer?: string; use?: string; alg?: string };
type Jwks = { keys?: MicrosoftJwk[] };

export async function validateMicrosoftIdToken(input: {
  idToken: string;
  clientId: string;
  expectedNonce: string;
}): Promise<MicrosoftIdentity> {
  const parsed = parseJwt(input.idToken);
  const claims = validateClaims(parsed.claims, input.clientId, input.expectedNonce);
  const key = await getSigningKey(parsed.header, claims);
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    parsed.signature,
    new TextEncoder().encode(parsed.signingInput),
  );
  if (!verified) throw new Error("Microsoft ID token signature validation failed.");

  const stableObjectId = typeof claims.oid === "string" && claims.oid ? claims.oid : claims.sub;
  return {
    userId: `${claims.tid}|${stableObjectId}`,
    displayName: typeof claims.name === "string" ? claims.name : undefined,
    username: typeof claims.preferred_username === "string" ? claims.preferred_username : undefined,
  };
}

function parseJwt(idToken: string): {
  header: JwtHeader;
  claims: IdTokenClaims;
  signingInput: string;
  signature: Uint8Array;
} {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error("Microsoft ID token was malformed.");
  let header: JwtHeader;
  let claims: IdTokenClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as JwtHeader;
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as IdTokenClaims;
  } catch {
    throw new Error("Microsoft ID token could not be decoded.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Microsoft ID token used an unsupported signing algorithm or key.");
  }
  return {
    header,
    claims,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecode(parts[2]),
  };
}

function validateClaims(claims: IdTokenClaims, clientId: string, expectedNonce: string): IdTokenClaims & {
  tid: string;
  iss: string;
  sub: string;
} {
  if (claims.aud !== clientId) throw new Error("Microsoft ID token audience did not match this application.");
  if (claims.nonce !== expectedNonce) throw new Error("Microsoft ID token nonce did not match the authorization request.");
  if (typeof claims.tid !== "string" || !TENANT_ID.test(claims.tid)) throw new Error("Microsoft ID token tenant was invalid.");
  const expectedIssuer = `https://login.microsoftonline.com/${claims.tid}/v2.0`;
  if (claims.iss !== expectedIssuer) throw new Error("Microsoft ID token issuer was invalid.");
  if (claims.ver !== undefined && claims.ver !== "2.0") throw new Error("Microsoft ID token version was not v2.0.");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("Microsoft ID token did not contain a subject.");

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("Microsoft ID token has expired.");
  }
  if (typeof claims.nbf === "number" && Number.isFinite(claims.nbf) && claims.nbf - CLOCK_SKEW_SECONDS > now) {
    throw new Error("Microsoft ID token is not valid yet.");
  }
  if (typeof claims.iat === "number" && Number.isFinite(claims.iat) && claims.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error("Microsoft ID token issue time was in the future.");
  }
  return claims as IdTokenClaims & { tid: string; iss: string; sub: string };
}

async function getSigningKey(header: JwtHeader, claims: IdTokenClaims & { tid: string; iss: string }): Promise<MicrosoftJwk> {
  const configuration = await fetchJson<OpenIdConfiguration>(OIDC_CONFIG_URL);
  if (!configuration.jwks_uri) throw new Error("Microsoft OpenID metadata did not include a signing-key endpoint.");
  const jwksUrl = new URL(configuration.jwks_uri);
  if (jwksUrl.protocol !== "https:" || jwksUrl.hostname !== "login.microsoftonline.com") {
    throw new Error("Microsoft OpenID metadata returned an unexpected signing-key endpoint.");
  }
  const jwks = await fetchJson<Jwks>(jwksUrl.toString());
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA" && candidate.use !== "enc");
  if (!key) throw new Error("Microsoft ID token signing key was not found.");
  if (key.alg && key.alg !== "RS256") throw new Error("Microsoft ID token signing key used an unexpected algorithm.");
  if (key.issuer) {
    const expectedKeyIssuer = key.issuer.replace(/\{tenantid\}/gi, claims.tid);
    if (expectedKeyIssuer !== claims.iss) throw new Error("Microsoft signing key issuer did not match the token issuer.");
  }
  return key;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OIDC_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Microsoft OpenID metadata request failed with HTTP ${response.status}.`);
    return (await response.json()) as T;
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error("Microsoft OpenID metadata request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url encoding.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
