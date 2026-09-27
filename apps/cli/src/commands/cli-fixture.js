// @ts-check
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

/**
 * Shared harness for the CLI child-process suites: the direct entry spawn, the stderr JSON
 * picker, and a fresh-signer child env. Children run `bun --no-env-file run apps/cli/src/main.js`
 * — the flag must govern the one process that loads env files: going through the `solos`
 * package script would start a second Bun without the flag, which loads `.env`/`.env.local`
 * again. Real users keep normal env loading; only this harness opts out.
 */

export const ROOT = new URL("../../../..", import.meta.url).pathname;
export const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");

/**
 * Spawn the CLI entry directly.
 * @param {string[]} args
 * @param {Record<string, string>} env
 * @param {{ cwd?: string; shouldLoadEnvFile?: boolean }} [options] `shouldLoadEnvFile: true`
 *   opts OUT of isolation, only to prove a developer `.env` file would really be loaded
 */
export const runSolos = async (args, env, options = {}) => {
  const { cwd = ROOT, shouldLoadEnvFile = false } = options;
  const proc = Bun.spawn(
    [process.execPath, ...(shouldLoadEnvFile ? [] : ["--no-env-file"]), "run", CLI_ENTRY, ...args],
    {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

/**
 * `bun run` wraps the CLI's stderr with its own lines; pick the JSON line the CLI printed.
 * @param {string} stderr
 * @returns {any} the parsed CLI output, or undefined when stderr has no JSON line
 */
export const stderrJson = (stderr) => {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("{"));
  return line === undefined ? undefined : JSON.parse(line);
};

/**
 * Child env against the running Surfnet with a throwaway signer, so assertions about the
 * configured signer can never collide with a real wallet profile on the machine.
 * @param {{ rpcUrl: string; wsUrl: string }} surfnet
 * @returns {Promise<Record<string, string>>}
 */
export const solanaEnv = async (surfnet) => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
  // These suites drive execute tools, so they opt into the ceiling an Operator would. The
  // simulate-by-default behaviour has its own coverage in packages/mcp/src/server/tier-ceiling.test.js.
  SOLOS_TOOL_TIER: "execute",
});
