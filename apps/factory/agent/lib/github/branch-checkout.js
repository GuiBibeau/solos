// @ts-check
import { runBrokered } from "./brokered-git.js";
import { REMOTE_URL, REPO_DIR, validateBranch } from "./git-remote.js";
import { BUN_BIN } from "./repo-sandbox.js";

/** @typedef {import("eve/tools").ToolContext} ToolContext */
/** @typedef {{ error: string; success: false } | { branch: string; sha: string; success: true }} BranchResult */
/** @typedef {{branch?: string, currentBranch?: string, currentHead?: string, dirty: boolean, expectedHead?: string, remoteHead?: string}} CheckoutState */
/** @typedef {{error: string} | {change: boolean}} CheckoutDecision */
/** @typedef {{error: string} | {change: boolean, remoteHead: string}} FetchDecision */

/** @param {ToolContext} ctx */
const localState = async (ctx) => {
  const sandbox = await ctx.getSandbox();
  const result = await sandbox.run({
    command:
      `git -C ${REPO_DIR} status --porcelain && ` +
      `git -C ${REPO_DIR} branch --show-current && git -C ${REPO_DIR} rev-parse HEAD`,
  });
  const lines = String(result.stdout).trim().split("\n");
  if (result.exitCode !== 0) return { error: String(result.stderr || result.stdout).trim() };
  const head = lines.pop() ?? "";
  const branch = lines.pop() ?? "";
  return { branch, dirty: lines.length > 0, head };
};

/** Pure preservation decision, separated so dirty/diverged cases are regression tested. */
/** @param {CheckoutState} state @returns {CheckoutDecision} */
export const checkoutDecision = (state) => {
  if (state.dirty)
    return {
      error:
        "Checkout has uncommitted work; it was left byte-for-byte intact. Commit or preserve it before retrying.",
    };
  if (state.expectedHead !== undefined && state.remoteHead !== state.expectedHead)
    return {
      error: `Remote head moved from expected ${state.expectedHead} to ${state.remoteHead}; checkout was not changed.`,
    };
  if (state.currentBranch === state.branch && state.currentHead !== state.remoteHead)
    return {
      error: `Local ${state.branch} is at ${state.currentHead}, not remote ${state.remoteHead}; local commits were preserved.`,
    };
  return { change: state.currentBranch !== state.branch || state.currentHead !== state.remoteHead };
};

/** @param {ToolContext} ctx @param {{branch: string, expectedHead?: string, before: {branch: string, dirty: boolean, head: string}}} input @returns {Promise<FetchDecision>} */
const fetchDecision = async (ctx, { branch, expectedHead, before }) => {
  const fetch = await runBrokered(ctx, `git -C ${REPO_DIR} fetch ${REMOTE_URL} '${branch}'`);
  if (fetch.exitCode !== 0) return { error: `git fetch exited ${fetch.exitCode}: ${fetch.detail}` };
  const sandbox = await ctx.getSandbox();
  const fetched = await sandbox.run({ command: `git -C ${REPO_DIR} rev-parse FETCH_HEAD` });
  if (fetched.exitCode !== 0) return { error: "Fetched branch head could not be read." };
  const remoteHead = String(fetched.stdout).trim();
  const decision = checkoutDecision({
    branch,
    currentBranch: before.branch,
    currentHead: before.head,
    dirty: false,
    expectedHead,
    remoteHead,
  });
  return "error" in decision ? decision : { change: decision.change, remoteHead };
};

/** @param {ToolContext} ctx @param {{branch: string, remoteHead: string, shouldChange: boolean}} input */
const changeAndInstall = async (ctx, { branch, remoteHead, shouldChange }) => {
  const sandbox = await ctx.getSandbox();
  if (shouldChange) {
    const checkout = await sandbox.run({
      command: `git -C ${REPO_DIR} checkout -B '${branch}' FETCH_HEAD`,
    });
    if (checkout.exitCode !== 0)
      return `git checkout exited ${checkout.exitCode}: ${String(checkout.stderr).trim()}`;
  }
  const install = await sandbox.run({
    command: `cd ${REPO_DIR} && export PATH="${BUN_BIN}:$PATH" && bun install --frozen-lockfile`,
  });
  return install.exitCode === 0
    ? null
    : `Frozen lockfile install failed at ${remoteHead}: ${String(install.stderr).trim()}`;
};

/** Fetch without changing files, validate the expected head, then change only a clean checkout. */
/** @param {{branch: string, expectedHead?: string}} input @param {ToolContext} ctx @returns {Promise<BranchResult>} */
export const checkoutBranch = async ({ branch, expectedHead }, ctx) => {
  const refusal = validateBranch(branch);
  if (refusal !== null) return { error: refusal, success: false };
  const before = await localState(ctx);
  if ("error" in before)
    return { error: `Cannot inspect checkout: ${before.error}`, success: false };
  if (before.dirty)
    return {
      error:
        "Checkout has uncommitted work; it was left byte-for-byte intact. Commit or preserve it before retrying.",
      success: false,
    };
  const decision = await fetchDecision(ctx, { before, branch, expectedHead });
  if ("error" in decision) return { error: decision.error, success: false };
  const installError = await changeAndInstall(ctx, {
    branch,
    remoteHead: decision.remoteHead,
    shouldChange: decision.change,
  });
  if (installError) return { error: installError, success: false };
  return { branch, sha: decision.remoteHead, success: true };
};
