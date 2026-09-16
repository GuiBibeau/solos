// @ts-check
import { captureCommand, lastLine } from "./run-steps.js";

/**
 * Commit identity for the Evidence: HEAD sha and whether the tree has uncommitted changes.
 * @returns {Promise<{ sha: string; dirty: boolean }>}
 */
export const gitInfo = async () => {
  const [head, status] = await Promise.all([
    captureCommand(["git", "rev-parse", "HEAD"]),
    captureCommand(["git", "status", "--porcelain"]),
  ]);
  if (head.code !== 0) throw new Error(`git rev-parse HEAD failed: ${lastLine(head.output)}`);
  return { sha: lastLine(head.output), dirty: status.output.trim().length > 0 };
};

/**
 * Tool versions recorded alongside the run. `surfpool` is null when not on PATH.
 * @returns {Promise<{ bun: string; surfpool: string | null }>}
 */
export const toolVersions = async () => {
  if (!Bun.which("surfpool")) return { bun: Bun.version, surfpool: null };
  const { code, output } = await captureCommand(["surfpool", "--version"]);
  return { bun: Bun.version, surfpool: code === 0 ? lastLine(output) : null };
};
