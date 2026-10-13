import { GPT_NOTE_MARKER } from "./model-guidance";

/**
 * Preserve the user-owned region of a GPT collaboration note.
 * Notes without a GPT marker remain ordinary Microsoft To Do notes.
 */
export function mergeProtectedTaskNote(existing: string, proposed: string): string {
  const existingMarker = existing.indexOf(GPT_NOTE_MARKER);
  const proposedMarker = proposed.indexOf(GPT_NOTE_MARKER);

  if (existingMarker >= 0) {
    if (proposedMarker < 0) {
      throw new Error(`GPT collaboration note updates must retain the ${GPT_NOTE_MARKER} marker. Re-read the task before updating its notes.`);
    }
    return existing.slice(0, existingMarker) + proposed.slice(proposedMarker);
  }

  if (proposedMarker < 0 || existing.length === 0) return proposed;

  const proposedPrefix = proposed.slice(0, proposedMarker);
  if (proposedPrefix === existing || proposedPrefix.trimEnd() === existing.trimEnd()) {
    return existing + proposed.slice(proposedMarker);
  }

  const separator = existing.endsWith("\n") ? "\n\n" : "\n\n\n";
  return existing + separator + proposed.slice(proposedMarker);
}
