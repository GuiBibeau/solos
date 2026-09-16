// @ts-check
/**
 * Loads the current user's saved preferences from Blob. The key is derived from the
 * framework-resolved principal, never from model input. `found: false` with a `note` is the normal
 * state for runs with no user principal (unattended intake runs as a service principal).
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { readDocument } from "../lib/blob.js";
import { userPreferencesKey } from "../lib/user-preferences.js";

const NO_USER_NOTE =
  "This run has no signed-in user, so per-user preferences don't apply. That is the normal state for unattended runs; proceed without them.";

export default defineTool({
  description:
    "Load this user's saved preferences (standing notes that personalize how you work for them). " +
    "Call it at the start of a task; returns empty when the user has none yet, or when the run has no " +
    "signed-in user (unattended runs), which is normal.",
  async execute(_input, ctx) {
    const key = userPreferencesKey(ctx.session.auth.current);
    if (key === null) return { found: false, note: NO_USER_NOTE, preferences: "" };
    try {
      const doc = await readDocument(key);
      return doc.found
        ? { found: true, preferences: doc.content }
        : { found: false, preferences: "" };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to load preferences",
        found: false,
        preferences: "",
      };
    }
  },
  inputSchema: z.object({}),
  outputSchema: z.object({
    error: z.string().optional(),
    found: z.boolean(),
    note: z.string().optional(),
    preferences: z.string(),
  }),
});
