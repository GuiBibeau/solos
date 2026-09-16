// @ts-check
/**
 * Loads the shared factory brain from Blob. Reading is unrestricted: every run, unattended
 * included, may load the brain for context. Empty is a normal state, not an error.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { readDocument } from "../lib/blob.js";
import { factoryBrainKey } from "../lib/factory-brain.js";

export default defineTool({
  description:
    "Load the factory brain: durable, shared notes about the solOS repository (build quirks, verification " +
    "gotchas, recurring review findings, conventions). Call it at the start of a task and weave relevant facts " +
    "into the messages you send stations, since stations can't read it themselves. Returns empty when the brain " +
    "has nothing yet.",
  async execute() {
    try {
      const doc = await readDocument(factoryBrainKey());
      return doc.found ? { brain: doc.content, found: true } : { brain: "", found: false };
    } catch (error) {
      return {
        brain: "",
        error: error instanceof Error ? error.message : "Failed to load the factory brain",
        found: false,
      };
    }
  },
  inputSchema: z.object({}),
  outputSchema: z.object({ brain: z.string(), error: z.string().optional(), found: z.boolean() }),
});
