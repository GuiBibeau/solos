// @ts-check
import { githubCredentials } from "./credentials.js";
import { brokerPolicy, mintInstallationToken } from "./git-remote.js";

/** @typedef {import("eve/tools").ToolContext} ToolContext */

/** Run a git command while the installation token is brokered at the firewall. */
/** @param {ToolContext} ctx @param {string} command */
export const runBrokered = async (ctx, command) => {
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
