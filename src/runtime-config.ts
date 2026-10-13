const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MicrosoftRuntimeConfig = {
  clientId: string;
  clientSecret: string;
};

export function getMicrosoftRuntimeConfig(env: Env): MicrosoftRuntimeConfig {
  const clientId = typeof env.MICROSOFT_CLIENT_ID === "string" ? env.MICROSOFT_CLIENT_ID.trim() : "";
  const clientSecret = typeof env.MICROSOFT_CLIENT_SECRET === "string" ? env.MICROSOFT_CLIENT_SECRET.trim() : "";

  if (!CLIENT_ID.test(clientId)) {
    throw new Error("Microsoft OAuth runtime configuration is incomplete: MICROSOFT_CLIENT_ID is missing or invalid.");
  }
  if (!clientSecret) {
    throw new Error("Microsoft OAuth runtime configuration is incomplete: MICROSOFT_CLIENT_SECRET is missing.");
  }
  return { clientId, clientSecret };
}

export function isMicrosoftRuntimeConfigured(env: Env): boolean {
  try {
    getMicrosoftRuntimeConfig(env);
    return true;
  } catch {
    return false;
  }
}
