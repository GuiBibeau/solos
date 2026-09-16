// @ts-check
/**
 * Permanently deletes the current user's saved preferences. Irreversible, so gated on human
 * approval with `always()`. The key is derived from the framework-resolved principal.
 */
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { deleteDocument } from "../lib/blob.js";
import { userPreferencesKey } from "../lib/user-preferences.js";

export default defineTool({
  approval: always(),
  description:
    "Permanently delete this user's saved preferences. Use only when the user explicitly asks to reset or " +
    "forget their preferences. This is irreversible.",
  async execute(_input, ctx) {
    const key = userPreferencesKey(ctx.session.auth.current);
    if (key === null)
      return {
        deleted: false,
        error: "No signed-in user to clear preferences for.",
        success: false,
      };
    try {
      const { existed } = await deleteDocument(key);
      return { deleted: existed, success: true };
    } catch (error) {
      return {
        deleted: false,
        error: error instanceof Error ? error.message : "Failed to clear preferences",
        success: false,
      };
    }
  },
  inputSchema: z.object({}),
  outputSchema: z.object({
    deleted: z.boolean(),
    error: z.string().optional(),
    success: z.boolean(),
  }),
});
