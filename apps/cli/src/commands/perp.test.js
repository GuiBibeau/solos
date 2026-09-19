// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "@solos/solana/surfnet";

const ROOT = new URL("../../../..", import.meta.url).pathname;
const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");

/** The System Program stands in for a fixture trader authority. */
const OWNER = "So11111111111111111111111111111111111111112";
const MARKET_CONFIG = { symbol: "SOL", baseLotsDecimals: 2, tickSize: 100 };

/** Documented trader-state body: one open long, 1500 lots at 2 decimals = 15 SOL. */
const traderState = (authority) => ({
  authority,
  traderPdaIndex: 0,
  slot: 448_348_464,
  slotIndex: 1355,
  snapshot: {
    version: 1,
    capabilities: { flags: 62, state: "active", capabilities: {} },
    makerFeeOverrideMultiplier: 1,
    takerFeeOverrideMultiplier: 1,
    subaccounts: [
      { subaccountIndex: 0, sequence: 0, collateral: "500000000", positions: [positionRow()] },
    ],
  },
});

function positionRow() {
  return {
    symbol: "SOL",
    positionSequenceNumber: "1",
    basePositionLots: "1500",
    entryPriceTicks: "15000",
    virtualQuotePositionLots: "0",
    unsettledFundingQuoteLots: "0",
    accumulatedFundingQuoteLots: "0",
  };
}

/**
 * Spawn the CLI entry directly — `bun --no-env-file run apps/cli/src/main.js` (see
 * market.test.js for why the flag governs the one process that loads env files).
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
const runSolos = async (args, env) => {
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

/** @param {string} stderr @returns {any} the parsed CLI error line, or undefined */
const stderrJson = (stderr) => {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("{"));
  return line === undefined ? undefined : JSON.parse(line);
};

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {{ requests: Array<{ path: string; query: Record<string, string> }>; url: string; stop: () => void }} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (url.pathname === "/v1/view/exchange/market/SOL") return Response.json(MARKET_CONFIG);
      if (url.pathname.startsWith("/v1/trader/state/")) {
        const authority = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        return Response.json(traderState(authority));
      }
      return Response.json({ error: `Market 'DOGE' not found` }, { status: 404 });
    },
  });
  fixture = { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
});

afterAll(() => {
  fixture?.stop();
});

/** Fresh disposable signer per process, so the default-owner assertion is airtight. */
const signerEnv = async () => {
  const seed = randomSeed();
  return {
    seed,
    env: {
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLANA_WS_URL: surfnet.wsUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
      SOLOS_LOG_LEVEL: "warn",
      PHOENIX_BASE_URL: fixture.url,
    },
  };
};

describe("`solos perp position` through a real CLI child process [integration]", () => {
  test("prints the contract JSON and resolves the omitted owner to the configured signer", async () => {
    const { seed, env } = await signerEnv();
    const address = await seedAddress(seed);
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(
      ["perp", "position", "--market", "SOL-PERP"],
      env,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.position).toMatchObject({
      kind: "perp",
      protocol: "phoenix",
      account: address,
      instrument: "SOL",
      side: "long",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
    expect(result.account).toMatchObject({
      protocol: "phoenix",
      account: address,
      equityUsd: null,
    });
    const seen = fixture.requests.slice(before);
    const market = seen.find((entry) => entry.path.startsWith("/v1/view/exchange/market/"));
    const trader = seen.find((entry) => entry.path.startsWith("/v1/trader/state/"));
    expect(market?.path).toBe("/v1/view/exchange/market/SOL");
    expect(trader?.query).toEqual({ traderPdaIndex: "0" });
    expect(trader?.path).toBe(`/v1/trader/state/${address}`);
  });

  test("an unknown market exits non-zero with the tagged error before account work", async () => {
    const { env } = await signerEnv();
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(["perp", "position", "--market", "DOGE"], env);
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "PerpMarketUnknown", market: "DOGE" });
    expect(fixture.requests.slice(before)).toHaveLength(1);
  });

  test("an explicit owner is honored verbatim instead of the signer", async () => {
    const { env } = await signerEnv();
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["perp", "position", "--market", "SOL", "--owner", OWNER],
      env,
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout).position.account).toBe(OWNER);
    const trader = fixture.requests
      .slice(before)
      .find((entry) => entry.path.startsWith("/v1/trader/state/"));
    expect(trader?.path).toBe(`/v1/trader/state/${OWNER}`);
  });
});
