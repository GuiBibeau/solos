// @ts-check
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

/**
 * Shared harness for the `solos transfer sol` command tests: the child-process runner, the stderr
 * JSON picker, and child envs whose signer is never a real wallet — a throwaway seed or an
 * explicitly nonexistent keypair file, always behind a fresh config dir.
 */

export const ROOT = new URL("../../../..", import.meta.url).pathname;
export const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");

/** Unreachable loopback endpoint: the contrast proving rejection precedes any provider work. */
export const DEAD_RPC_URL = "http://127.0.0.1:1";

/** Keypair path that cannot exist: its directory is never created. */
export const MISSING_KEYPAIR_PATH = path.join(
  tmpdir(),
  `solos-qa-missing-${crypto.randomUUID()}`,
  "keypair.json",
);

/**
 * Spawn the CLI entry directly — `bun --no-env-file run apps/cli/src/main.js`. The flag must
 * govern the one process that loads env files: going through the `solos` package script would
 * start a second Bun without the flag, which loads `.env`/`.env.local` again.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
export const runSolos = async (args, env) => {
  const proc = Bun.spawn([process.execPath, "--no-env-file", "run", CLI_ENTRY, ...args], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
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
 * Env for one CLI child process: the given RPC, a throwaway signer from `seed`, and a fresh
 * config dir; the WS URL is derived like production. Callers own the `SOLOS_CONFIG_DIR` and
 * remove it after the run.
 * @param {string} rpcUrl
 * @param {Uint8Array} [seed]
 * @returns {Promise<Record<string, string>>}
 */
export const transferEnv = async (rpcUrl, seed = randomSeed()) => ({
  SOLANA_RPC_URL: rpcUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
  SOLOS_CONFIG_DIR: await mkdtemp(path.join(tmpdir(), "solos-transfer-cli-")),
  SOLOS_LOG_LEVEL: "warn",
});

/** Offline env: dead loopback RPC, throwaway signer, no datasource — nothing usable downstream. */
export const offlineEnv = () => transferEnv(DEAD_RPC_URL);

/**
 * Offline env whose signer Layer cannot load: nonexistent keypair file plus dead RPC. Bad input
 * must be rejected before this env is ever touched; good input fails with SignerUnavailable.
 * @returns {Promise<Record<string, string>>}
 */
export const unusableSignerEnv = async () => ({
  SOLANA_RPC_URL: DEAD_RPC_URL,
  SOLOS_SIGNER_KEYPAIR_PATH: MISSING_KEYPAIR_PATH,
  SOLOS_CONFIG_DIR: await mkdtemp(path.join(tmpdir(), "solos-transfer-cli-")),
  SOLOS_LOG_LEVEL: "warn",
});
