// @ts-check
import { REPO_DIR } from "../github/git-remote.js";

/** @param {import("eve/sandbox").SandboxSession} sandbox @param {string} command */
const read = async (sandbox, command) => {
  const result = await sandbox.run({
    command: `git -C ${REPO_DIR} ${command}`,
  });
  if (result.exitCode !== 0) throw new Error("Checkpoint inventory failed.");
  return String(result.stdout ?? "").trim();
};

/** @param {string} status */
const dirtyFiles = (status) =>
  status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? line.slice(3))
    .slice(0, 100);

/** Inspect only Git metadata in the station's preserved checkout. */
/** @param {import("eve/hooks").HookContext} ctx */
export const inspectCheckpointInventory = async (ctx) => {
  const sandbox = await ctx.getSandbox();
  const [name, head, status] = await Promise.all([
    read(sandbox, "branch --show-current"),
    read(sandbox, "rev-parse HEAD"),
    read(sandbox, "status --porcelain"),
  ]);
  return {
    dirty: status.length > 0,
    dirtyFiles: dirtyFiles(status),
    ...(head.length === 40 && { head }),
    ...(name.length > 0 && { name }),
  };
};
