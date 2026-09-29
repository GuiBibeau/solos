// @ts-check
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

/**
 * Shared harness for the `solos swap quote` command tests: the documented quote-only body, the
 * child-process runner, and a recording loopback fixture for JUPITER_BASE_URL. Never contacts
 * the real Jupiter endpoint.
 */

export const ROOT = new URL("../../../..", import.meta.url).pathname;
export const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");
export const KEY = "test-jupiter-key";
export const INPUT_MINT = "So11111111111111111111111111111111111111112";
export const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const AMOUNT = "1000000000000000000000000000000";

/** Quote-only Metis-routed body, reconstructed from the documented V2 envelope. */
export const BODY = {
  mode: "manual",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: "169900000000000000000000000000",
  otherAmountThreshold: "169050500000000000000000000000",
  priceImpact: 1,
  priceImpactPct: "0.01",
  swapMode: "ExactIn",
  slippageBps: 50,
  router: "metis",
  swapType: "aggregator",
  routePlan: [
    {
      swapInfo: {
        ammKey: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
        label: "Orca",
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        inAmount: AMOUNT,
        outAmount: "169900000000000000000000000000",
      },
      percent: 100,
      bps: 10_000,
    },
  ],
  transaction: null,
  taker: null,
  guaranteedPrice: false,
  jitOptimized: false,
};

/**
 * Environment for one CLI child process: Surfnet addresses plus a fresh throwaway signer.
 * @param {{ rpcUrl: string; wsUrl: string }} surfnet
 */
export const solanaEnv = async (surfnet) => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
  SOLOS_TOOL_TIER: "execute",
  SOLOS_TOOLS: "all",
});

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

/** The documented success body; tests swap the responder for error scenarios. */
const defaultResponse = () => Response.json(BODY);

/**
 * Recording loopback fixture: records every request, answers through the swappable responder,
 * and starts on the documented success body.
 * @returns {{ requests: Array<{ url: string; method: string; key: string | undefined; amount: string | null; excludeRouters: string | null; taker: string | null }>; url: string; stop: () => void; respondWith: (respond: () => Response) => void }}
 */
export const startSwapFixture = () => {
  /** @type {Array<{ url: string; method: string; key: string | undefined; amount: string | null; excludeRouters: string | null; taker: string | null }>} */
  const requests = [];
  let respond = defaultResponse;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const params = new URL(request.url).searchParams;
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-api-key") ?? undefined,
        amount: params.get("amount"),
        excludeRouters: params.get("excludeRouters"),
        taker: params.get("taker"),
      });
      return respond();
    },
  });
  return {
    requests,
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
    respondWith: (next) => {
      respond = next;
    },
  };
};
