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
/** @typedef {{branch?: string, expectedHead?: string, scope: Scope}} VerificationInput */

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
    const evidence = JSON.parse(raw);
    return (
      evidence.sha === facts.actualHead &&
      evidence.scope === scope &&
      evidence.dirty === false &&
      evidence.ok === true
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

/** @param {VerificationInput} input @param {ToolContext} ctx */
const execute = async (input, ctx) => {
  const sandbox = await ctx.getSandbox();
  await assertNoSolanaSecrets(sandbox);
  const observedRemote = await remoteHead(ctx, input.branch);
  const facts = await measure(sandbox, input, observedRemote);
  facts.remoteHead = (await remoteHead(ctx, input.branch)) ?? null;
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
    execute,
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
        .describe("Immutable revision SHA expected locally and remotely."),
      scope: z.enum(["check", "unit", "full"]),
    }),
  });
