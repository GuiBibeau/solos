// @ts-check
/**
 * The local Surfpool's state file: where `solos dev surfpool up` records the process it started,
 * and the checks `down`, `status` and the cheatcodes run before trusting it. The file is
 * gitignored and writable by anything in the checkout, so it is validated like input.
 */
import { existsSync, readFileSync } from "node:fs";

export const STATE_DIR = ".solos";
export const STATE_FILE = `${STATE_DIR}/surfpool.json`;

/** @typedef {{ pid: number; rpcUrl: string; wsUrl: string; offline: boolean }} SurfpoolState */

/** Only a loopback endpoint can be the local Surfpool this command started. @param {string} raw @param {string} scheme */
const isLoopback = (raw, scheme) => {
  try {
    const url = new URL(raw);
    return (
      url.protocol === scheme && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
};

/**
 * The workspace state file is gitignored and writable by anything in the checkout, so it is
 * validated like input: a positive pid and loopback URLs, or it is treated as absent.
 * @returns {SurfpoolState | undefined}
 */
/** @param {Partial<SurfpoolState>} state */
const isValidState = (state) =>
  Number.isSafeInteger(state.pid) &&
  /** @type {number} */ (state.pid) > 0 &&
  typeof state.rpcUrl === "string" &&
  isLoopback(state.rpcUrl, "http:") &&
  typeof state.wsUrl === "string" &&
  isLoopback(state.wsUrl, "ws:");

export const readState = () => {
  if (!existsSync(STATE_FILE)) return undefined;
  try {
    const state = /** @type {Partial<SurfpoolState>} */ (
      JSON.parse(readFileSync(STATE_FILE, "utf8"))
    );
    return isValidState(state) ? /** @type {SurfpoolState} */ (state) : undefined;
  } catch {
    return undefined;
  }
};

/** Whether a pid still belongs to a surfpool process, so `down` never signals a reused pid. */
export const isSurfpoolPid = (/** @type {number} */ pid) => {
  const probe = Bun.spawnSync(["ps", "-p", String(pid), "-o", "comm="]);
  return probe.exitCode === 0 && probe.stdout.toString().trimEnd().endsWith("surfpool");
};
