import type { StoredMicrosoftTokens } from "./types";

export function chooseMicrosoftRefreshCommit(
  sourceRefreshToken: string,
  refreshed: StoredMicrosoftTokens,
  current: StoredMicrosoftTokens | undefined,
): { shouldPersist: boolean; tokens: StoredMicrosoftTokens } {
  if (!current) throw new Error("Microsoft OAuth credentials disappeared while refreshing.");
  if (current.refreshToken !== sourceRefreshToken) {
    return { shouldPersist: false, tokens: current };
  }
  return { shouldPersist: true, tokens: refreshed };
}
