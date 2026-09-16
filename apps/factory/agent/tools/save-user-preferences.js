// @ts-check
/**
 * Saves the current user's standing preferences to Blob, overwriting the whole document. The key
 * is derived from the framework-resolved principal, never from model input.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeDocument } from "../lib/blob.js";
import { userPreferencesKey } from "../lib/user-preferences.js";

/** Preferences are a short, curated set of standing notes, not a transcript. */
const MAX_PREFERENCES_LENGTH = 20_000;

export default defineTool({
  description:
    "Save this user's standing preferences (Markdown). Overwrites the whole document: load the current " +
    "preferences first, merge in the new one, then save. Use only for durable preferences the user states, " +
    "not one-off instructions for a single task.",
  async execute({ preferences }, ctx) {
    const key = userPreferencesKey(ctx.session.auth.current);
    if (key === null)
      return { error: "No signed-in user to save preferences for.", success: false };
    try {
      const blob = await writeDocument(key, preferences, { allowOverwrite: true });
      return { pathname: blob.pathname, success: true };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to save preferences",
        success: false,
      };
    }
  },
  inputSchema: z.object({
    preferences: z
      .string()
      .min(1)
      .max(MAX_PREFERENCES_LENGTH)
      .describe(
        "The full preferences document as Markdown: the merged result, not just the new note.",
      ),
  }),
  outputSchema: z.object({
    error: z.string().optional(),
    pathname: z.string().optional(),
    success: z.boolean(),
  }),
});
