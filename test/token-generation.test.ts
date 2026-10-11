import { describe, expect, it } from "vitest";
import { chooseMicrosoftRefreshCommit } from "../src/token-generation";
import type { StoredMicrosoftTokens } from "../src/types";

function tokens(refreshToken: string, accessToken: string): StoredMicrosoftTokens {
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: 4_000_000_000_000,
    scope: "Tasks.ReadWrite",
  };
}

describe("Microsoft token refresh generation guard", () => {
  it("persists the refreshed generation when the source is still current", () => {
    const source = tokens("refresh-a", "access-a");
    const refreshed = tokens("refresh-b", "access-b");
    const decision = chooseMicrosoftRefreshCommit(source.refreshToken, refreshed, source);
    expect(decision).toEqual({ shouldPersist: true, tokens: refreshed });
  });

  it("preserves a newer token generation when an older refresh finishes late", () => {
    const refreshed = tokens("refresh-b", "access-b");
    const newer = tokens("refresh-c", "access-c");
    const decision = chooseMicrosoftRefreshCommit("refresh-a", refreshed, newer);
    expect(decision).toEqual({ shouldPersist: false, tokens: newer });
  });

  it("fails closed when credentials disappear during refresh", () => {
    const refreshed = tokens("refresh-b", "access-b");
    expect(() => chooseMicrosoftRefreshCommit("refresh-a", refreshed, undefined)).toThrow(/disappeared/);
  });
});
