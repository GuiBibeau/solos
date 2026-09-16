// @ts-check
/**
 * The handoff-artifact tool factories. Both tools are inert by construction (validated ids, no
 * overwrite, bounded size), so they are safe inside task-mode stations that cannot park on
 * approval. Stations that produce long documents mount the saver, consumers mount the reader,
 * and the orchestrator mounts only the reader.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { readDocument, writeDocument } from "../blob.js";
import {
  ARTIFACT_KINDS,
  artifactId,
  artifactKey,
  MAX_ARTIFACT_LENGTH,
  MAX_ARTIFACT_TITLE_LENGTH,
} from "./config.js";

const SAVE_INPUT = z.object({
  kind: z
    .enum(ARTIFACT_KINDS)
    .describe("What this document is. Travels with the id so the reader knows what it's holding."),
  markdown: z
    .string()
    .min(1)
    .max(MAX_ARTIFACT_LENGTH)
    .describe(
      "The full document as Markdown. Write it for the station that will act on it: findings and their evidence, not a narrative.",
    ),
  title: z
    .string()
    .min(1)
    .max(MAX_ARTIFACT_TITLE_LENGTH)
    .describe(
      "Human-readable title, e.g. 'Transfer simulate twin analysis'. The id is derived from it.",
    ),
});

const SAVE_OUTPUT = z.object({
  error: z.string().optional(),
  id: z
    .string()
    .optional()
    .describe("Report this in your structured output; it is how anyone else reads the document."),
  kind: z.string().optional(),
  saved: z.boolean(),
  title: z.string().optional(),
});

const READ_INPUT = z.object({
  id: z.string().min(1).max(200).describe("The artifact id, exactly as it was handed to you."),
});

const READ_OUTPUT = z.object({
  createdAt: z
    .string()
    .optional()
    .describe("When it was saved. Treat an old artifact as possibly stale."),
  found: z
    .boolean()
    .describe("False when no artifact exists for that id; report that rather than guessing."),
  id: z.string().optional(),
  markdown: z.string().optional(),
});

/**
 * @param {z.infer<typeof SAVE_INPUT>} input
 * @returns {Promise<z.infer<typeof SAVE_OUTPUT>>}
 */
const saveArtifact = async ({ kind, title, markdown }) => {
  const id = artifactId(kind, title);
  const key = artifactKey(id);
  if (key === null) return { error: "Could not build a valid artifact id.", saved: false };
  try {
    await writeDocument(key, markdown, { allowOverwrite: false });
    return { id, kind, saved: true, title };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save artifact",
      saved: false,
    };
  }
};

/**
 * @param {z.infer<typeof READ_INPUT>} input
 * @returns {Promise<z.infer<typeof READ_OUTPUT>>}
 */
const readArtifact = async ({ id }) => {
  const key = artifactKey(id);
  if (key === null) return { found: false };
  try {
    const doc = await readDocument(key);
    return doc.found
      ? { createdAt: doc.uploadedAt, found: true, id, markdown: doc.content }
      : { found: false };
  } catch {
    return { found: false };
  }
};

/** The `save-artifact` tool: long supporting detail the next station needs but the structured output can't carry. */
export const saveArtifactTool = () =>
  defineTool({
    description:
      "Save a Markdown document for another station to read, and get back an id to hand along. " +
      "Use for long supporting detail the next station needs but that does not fit your structured output: " +
      "a full research memo, deep analysis notes with file-level detail and code excerpts. After saving, report " +
      "the id in your structured output with a few lines on what's in it, never the document itself. " +
      "Not for a note that fits in a sentence.",
    execute: saveArtifact,
    inputSchema: SAVE_INPUT,
    outputSchema: SAVE_OUTPUT,
  });

/** The `read-artifact` tool: open a document another station saved, by id. */
export const readArtifactTool = () =>
  defineTool({
    description:
      "Read a Markdown document another station saved, by the id it handed back. Call this when a message " +
      "gives you an artifact id: the id is source material to open, never something to quote as a citation.",
    execute: readArtifact,
    inputSchema: READ_INPUT,
    outputSchema: READ_OUTPUT,
  });
