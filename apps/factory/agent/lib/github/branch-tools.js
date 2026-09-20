// @ts-check
/**
 * The station git tools. Both are inert by construction, which is why they run without approval
 * inside task-mode stations: `validateBranch` refuses main, master, refs/*, HEAD, and anything
 * outside a conservative character set, and pushes must carry `FACTORY_BRANCH_PREFIX`; the credential is brokered at the sandbox firewall and
 * dropped again in a `finally`; and a feature branch alone ships nothing.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { FACTORY_BRANCH_PREFIX } from "../constants.js";
import { checkoutBranch } from "./branch-checkout.js";
import { authorizeBranchPush } from "./branch-owner.js";
import { ancestryCommand, guardedPushCommand } from "./branch-push-protection.js";
import { runBrokered } from "./brokered-git.js";
import { REMOTE_URL, REPO_DIR, validateBranch } from "./git-remote.js";

/** @typedef {import("eve/tools").ToolContext} ToolContext */
/** @typedef {{ error: string; success: false } | { branch: string; sha: string; success: true }} BranchResult */

/**
 * @param {ToolContext} ctx
 * @param {string} ref A branch name that already passed `validateBranch`, or `HEAD`.
 */
const revParse = async (ctx, ref) => {
  const sandbox = await ctx.getSandbox();
  const head = await sandbox.run({ command: `git -C ${REPO_DIR} rev-parse '${ref}'` });
  return String(head.stdout).trim();
};

/**
 * Fetch a branch from the factory repository and check it out at FETCH_HEAD.
 * @param {{ branch: string }} input
 * @param {ToolContext} ctx
 * @returns {Promise<BranchResult>}
 */
/**
 * Push a committed local branch to the factory repository.
 * @param {{ branch: string, expectedHead?: string }} input
 * @param {ToolContext} ctx
 * @returns {Promise<BranchResult>}
 */
const pushBranch = async ({ branch, expectedHead }, ctx) => {
  const refusal = validateBranch(branch);
  if (refusal !== null) return { error: refusal, success: false };
  if (!branch.startsWith(FACTORY_BRANCH_PREFIX)) {
    return {
      error: `Factory branches must start with "${FACTORY_BRANCH_PREFIX}"; the protected-path check in CI keys on it.`,
      success: false,
    };
  }
  const observed = await runBrokered(
    ctx,
    `git -C ${REPO_DIR} ls-remote --heads ${REMOTE_URL} 'refs/heads/${branch}'`,
  );
  if (observed.exitCode !== 0)
    return {
      error: `git ls-remote exited ${observed.exitCode}: ${observed.detail}`,
      success: false,
    };
  const ownership = authorizeBranchPush({ expectedHead, remoteOutput: observed.detail });
  if (!ownership.allowed) return { error: ownership.error, success: false };
  const ancestry = ancestryCommand(branch, expectedHead);
  if (ancestry) {
    const check = await runBrokered(ctx, ancestry);
    if (check.exitCode !== 0)
      return { error: "Local update is not a fast-forward from expectedHead.", success: false };
  }
  const push = await runBrokered(ctx, guardedPushCommand(branch, expectedHead));
  if (push.exitCode !== 0)
    return { error: `git push exited ${push.exitCode}: ${push.detail}`, success: false };
  return { branch, sha: await revParse(ctx, branch), success: true };
};

/** @param {string} [branchDescription] */
export const checkoutBranchInputSchema = (branchDescription = "Existing revision branch.") =>
  z.object({
    branch: z.string().min(1).describe(branchDescription),
    expectedHead: z
      .string()
      .regex(/^[0-9a-f]{40}$/u)
      .describe("Required remote SHA; checkout refuses a moved revision head."),
  });

/**
 * The `checkout-branch` tool, described for the station that mounts it.
 * @param {{ description: string; branchDescription: string }} text
 */
export const checkoutBranchTool = (text) =>
  defineTool({
    description: text.description,
    execute: checkoutBranch,
    inputSchema: checkoutBranchInputSchema(text.branchDescription),
  });

/** The `push-branch` tool: the implementer's only side effect. */
export const pushBranchTool = () =>
  defineTool({
    description:
      `Push a local branch of the ${REPO_DIR} checkout to the factory repository. The branch must already exist ` +
      `locally with the work committed and the verification run, and its name must start with "${FACTORY_BRANCH_PREFIX}"; ` +
      "main and master are refused. After a successful " +
      "push, report the branch name in your structured output so the orchestrator can open the pull request.",
    execute: pushBranch,
    inputSchema: z.object({
      branch: z
        .string()
        .min(1)
        .describe("Branch name in /workspace/repo to push, e.g. factory/feat-swap-simulate-twin"),
      expectedHead: z
        .string()
        .regex(/^[0-9a-f]{40}$/u)
        .optional()
        .describe(
          "Required for an existing branch: the remote SHA returned by checkout-branch. Omit only for the first push of a new branch.",
        ),
    }),
  });
