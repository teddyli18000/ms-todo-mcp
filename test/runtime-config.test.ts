import { describe, expect, it } from "vitest";
import { getMicrosoftRuntimeConfig, isMicrosoftRuntimeConfigured } from "../src/runtime-config";

function env(clientId?: string, clientSecret?: string): Env {
  return {
    MICROSOFT_CLIENT_ID: clientId as string,
    MICROSOFT_CLIENT_SECRET: clientSecret as string,
  } as Env;
}

describe("Microsoft runtime configuration", () => {
  it("accepts a valid client id and non-empty secret", () => {
    const config = getMicrosoftRuntimeConfig(env("c9e4610b-c623-4a3d-b6d7-a443a0daa1d7", " secret-value "));
    expect(config).toEqual({ clientId: "c9e4610b-c623-4a3d-b6d7-a443a0daa1d7", clientSecret: "secret-value" });
    expect(isMicrosoftRuntimeConfigured(env("c9e4610b-c623-4a3d-b6d7-a443a0daa1d7", "secret-value"))).toBe(true);
  });

  it("rejects missing or malformed runtime values", () => {
    expect(() => getMicrosoftRuntimeConfig(env(undefined, "secret-value"))).toThrow(/CLIENT_ID/);
    expect(() => getMicrosoftRuntimeConfig(env("undefined", "secret-value"))).toThrow(/CLIENT_ID/);
    expect(() => getMicrosoftRuntimeConfig(env("c9e4610b-c623-4a3d-b6d7-a443a0daa1d7", undefined))).toThrow(/CLIENT_SECRET/);
    expect(isMicrosoftRuntimeConfigured(env("c9e4610b-c623-4a3d-b6d7-a443a0daa1d7", ""))).toBe(false);
  });
});
