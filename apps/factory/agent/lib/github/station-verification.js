// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseRemoteHead } from "./branch-owner.js";
import { runBrokered } from "./brokered-git.js";
import { REMOTE_URL, REPO_DIR, validateBranch } from "./git-remote.js";
import { assertNoSolanaSecrets } from "./sandbox-commands.js";
import { command, measure } from "./station-measurements.js";
import { evaluateReadiness } from "./station-readiness.js";

/** @typedef {import("eve/tools").ToolContext} ToolContext */
/** @typedef {"check" | "unit" | "full"} Scope */
/** @typedef {{branch?: string, expectedHead?: string, expectedRemoteHead?: string, scope: Scope}} VerificationInput */

const STEPS = {
  check: ["line-limit", "format", "lint", "depcruise", "typecheck"],
  full: ["line-limit", "format", "lint", "depcruise", "typecheck", "test:unit", "test:integration"],
  unit: ["line-limit", "format", "lint", "depcruise", "typecheck", "test:unit"],
};

const EvidenceShape = z.object({
  dirty: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  ok: z.boolean(),
  scope: z.enum(["check", "unit", "full"]),
  sha: z.string().regex(/^[0-9a-f]{40}$/u),
  startedAt: z.iso.datetime(),
  steps: z.array(
    z.object({
      command: z.string().min(1),
      ms: z.number().int().nonnegative(),
      name: z.string().min(1),
      ok: z.literal(true),
      summary: z.string(),
    }),
  ),
  versions: z.object({ bun: z.string().min(1), surfpool: z.string().nullable() }),
});

/** @param {ToolContext} ctx @param {string | undefined} branch */
const remoteHead = async (ctx, branch) => {
  if (!branch) return null;
  const refusal = validateBranch(branch);
  if (refusal) return undefined;
  const result = await runBrokered(
    ctx,
    `git -C ${REPO_DIR} ls-remote --heads ${REMOTE_URL} 'refs/heads/${branch}'`,
  );
  return result.exitCode === 0 ? parseRemoteHead(result.detail) : undefined;
};

/** @param {string} raw @param {{actualHead: string}} facts @param {Scope} scope */
const validEvidence = (raw, facts, scope) => {
  try {
    const parsed = EvidenceShape.safeParse(JSON.parse(raw));
    if (!parsed.success) return false;
    const evidence = parsed.data;
    return (
      evidence.sha === facts.actualHead &&
      evidence.scope === scope &&
      evidence.dirty === false &&
      evidence.ok === true &&
      evidence.steps.map((step) => step.name).join(",") === STEPS[scope].join(",")
    );
  } catch {
    return false;
  }
};

/** Preserve the verifier's exact output and exit code; neither Evidence nor a later command wins. */
/** @param {{result: {code: number, stderr: string, stdout: string}, facts: {actualHead: string}, scope: Scope, readiness: {diagnostics: unknown[], ready: boolean}}} input */
export const verificationResult = ({ result, facts, scope, readiness }) => {
  const evidenceMatches = validEvidence(result.stdout, facts, scope);
  return {
    evidence: result.stdout,
    evidenceMatches,
    exitCode: result.code,
    facts,
    readiness,
    success: result.code === 0 && evidenceMatches,
    verifierError: result.code === 0 ? "" : result.stderr,
  };
};

/** @typedef {(ctx: ToolContext, branch: string|undefined) => Promise<string|null|undefined>} InspectRemote */

/** @param {VerificationInput} input @param {ToolContext} ctx @param {InspectRemote} [inspectRemote] */
export const verifyStation = async (input, ctx, inspectRemote = remoteHead) => {
  const sandbox = await ctx.getSandbox();
  await assertNoSolanaSecrets(sandbox);
  const observedRemote = await inspectRemote(ctx, input.branch);
  const facts = await measure(sandbox, input, observedRemote);
  const refreshedRemote = await inspectRemote(ctx, input.branch);
  facts.remoteHead = refreshedRemote ?? null;
  facts.remoteLookupFailed ||= refreshedRemote === undefined;
  const readiness = evaluateReadiness(facts);
  if (!readiness.ready) return { facts, readiness, success: false };
  const result = await command(sandbox, `bun run solos dev verify --scope ${input.scope} --json`);
  return verificationResult({ facts, readiness, result, scope: input.scope });
};

/** Durable verification waits for the actual process exit and returns untouched Evidence JSON. */
export const stationVerificationTool = () =>
  defineTool({
    description:
      "Prepare this station for a requested verification scope, fail closed on dirty/wrong/stale heads or missing capabilities, then run the solos verifier and return its actual exit code and untouched Evidence JSON.",
    execute: verifyStation,
    inputSchema: z.object({
      branch: z
        .string()
        .min(1)
        .optional()
        .describe("Remote branch to recheck before verification."),
      expectedHead: z
        .string()
        .regex(/^[0-9a-f]{40}$/u)
        .optional()
        .describe("Immutable commit SHA expected in the local checkout."),
      expectedRemoteHead: z
        .string()
        .regex(/^[0-9a-f]{40}$/u)
        .optional()
        .describe("Remote baseline SHA that must remain unchanged before an amendment is pushed."),
      scope: z.enum(["check", "unit", "full"]),
    }),
  });
