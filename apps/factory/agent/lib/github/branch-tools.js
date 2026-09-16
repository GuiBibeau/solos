// @ts-check
/**
 * The station git tools. Both are inert by construction, which is why they run without approval
 * inside task-mode stations: `validateBranch` refuses main, master, refs/*, HEAD, and anything
 * outside a conservative character set; the credential is brokered at the sandbox firewall and
 * dropped again in a `finally`; and a feature branch alone ships nothing.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubCredentials } from "./credentials.js";
import {
  brokerPolicy,
  mintInstallationToken,
  REMOTE_URL,
  REPO_DIR,
  validateBranch,
} from "./git-remote.js";

/** @typedef {import("eve/tools").ToolContext} ToolContext */
/** @typedef {{ error: string; success: false } | { branch: string; sha: string; success: true }} BranchResult */

/**
 * Run one git command in the station sandbox with the installation token brokered at the firewall.
 * @param {ToolContext} ctx
 * @param {string} command
 * @returns {Promise<{ exitCode: number; detail: string }>}
 */
const runBrokered = async (ctx, command) => {
  const sandbox = await ctx.getSandbox();
  const token = await mintInstallationToken(githubCredentials);
  await sandbox.setNetworkPolicy(brokerPolicy(token));
  try {
    const result = await sandbox.run({ command });
    return { exitCode: result.exitCode, detail: String(result.stderr || result.stdout).trim() };
  } finally {
    await sandbox.setNetworkPolicy("allow-all");
  }
};

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
const checkoutBranch = async ({ branch }, ctx) => {
  const refusal = validateBranch(branch);
  if (refusal !== null) return { error: refusal, success: false };
  const fetch = await runBrokered(
    ctx,
    `git -C ${REPO_DIR} fetch ${REMOTE_URL} '${branch}' && git -C ${REPO_DIR} checkout -B '${branch}' FETCH_HEAD`,
  );
  if (fetch.exitCode !== 0) {
    return {
      error: `git fetch/checkout exited ${fetch.exitCode}: ${fetch.detail}`,
      success: false,
    };
  }
  return { branch, sha: await revParse(ctx, "HEAD"), success: true };
};

/**
 * Push a committed local branch to the factory repository.
 * @param {{ branch: string }} input
 * @param {ToolContext} ctx
 * @returns {Promise<BranchResult>}
 */
const pushBranch = async ({ branch }, ctx) => {
  const refusal = validateBranch(branch);
  if (refusal !== null) return { error: refusal, success: false };
  const push = await runBrokered(
    ctx,
    `git -C ${REPO_DIR} push ${REMOTE_URL} 'refs/heads/${branch}:refs/heads/${branch}'`,
  );
  if (push.exitCode !== 0)
    return { error: `git push exited ${push.exitCode}: ${push.detail}`, success: false };
  return { branch, sha: await revParse(ctx, branch), success: true };
};

/**
 * The `checkout-branch` tool, described for the station that mounts it.
 * @param {{ description: string; branchDescription: string }} text
 */
export const checkoutBranchTool = (text) =>
  defineTool({
    description: text.description,
    execute: checkoutBranch,
    inputSchema: z.object({ branch: z.string().min(1).describe(text.branchDescription) }),
  });

/** The `push-branch` tool: the implementer's only side effect. */
export const pushBranchTool = () =>
  defineTool({
    description:
      `Push a local branch of the ${REPO_DIR} checkout to the factory repository. The branch must already exist ` +
      "locally with the work committed and the verification run; main and master are refused. After a successful " +
      "push, report the branch name in your structured output so the orchestrator can open the pull request.",
    execute: pushBranch,
    inputSchema: z.object({
      branch: z
        .string()
        .min(1)
        .describe("Branch name in /workspace/repo to push, e.g. factory/feat-swap-simulate-twin"),
    }),
  });
