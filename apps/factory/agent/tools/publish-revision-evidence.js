// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveBotName } from "../lib/github/bot-name.js";
import {
  publishRevisionEvidence,
  reconcileEvidencePublication,
} from "../lib/github/publication-operation.js";
import { rebaseApi } from "../lib/github/rebase-api.js";

const sha = z.string().regex(/^[a-f\d]{40}$/u);
const inputSchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("publish"),
    pullNumber: z.number().int().positive(),
    targetSha: sha.describe("Full sha from the clean full Evidence"),
    expectedRemoteHead: sha.describe("Full sha confirmed at the remote PR head"),
    remoteResult: z.enum(["pushed", "rebased", "already-remote"]),
    evidence: z.string().min(2).describe("Untouched JSON emitted by solos dev verify --scope full"),
  }),
  z.object({
    phase: z.literal("reconcile"),
    pullNumber: z.number().int().positive(),
  }),
]);

export default defineTool({
  description:
    "Publish or reconcile one bounded exact-head Evidence operation for an existing pull request. " +
    "The tool records the operation durably, re-reads the remote head and latest body, preserves " +
    "valid exact-head Evidence and unrelated edits, refreshes only the Evidence workflow, and never " +
    "pushes code, starts a repair, waives checks, or merges. Call reconcile before responding to an " +
    "Evidence-only failure; repairAllowed=false means the recorded publication remains the sole owner.",
  inputSchema,
  async execute(input, ctx) {
    const context = {
      api: rebaseApi(),
      botName: await resolveBotName(),
      auth: ctx.session.auth.current,
    };
    return input.phase === "publish"
      ? publishRevisionEvidence(input, context)
      : reconcileEvidencePublication(input, context);
  },
});
