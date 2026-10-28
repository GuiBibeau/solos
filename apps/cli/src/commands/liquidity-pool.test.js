// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { seedMeteoraPair, seedMeteoraPosition } from "@solos/solana/liquidity/meteora-dlmm-seeds";
import { seedRaydiumPool, seedRaydiumPosition } from "@solos/solana/liquidity/raydium-clmm-seeds";
import { randomAddress } from "@solos/solana/liquidity/whirlpool-fixture";
import { runSolos, stderrJson } from "./cli-fixture.js";
import { DEAD_RPC_URL, seedLiquidityCliFixtures, signerEnv } from "./liquidity-fixture.js";

/** Bin 0 is raw price 1. Decimals 9 and 6 shift that to 1000 token B per one token A. */
const PRICE_AT_BIN_ZERO = "1000";

/** @type {Awaited<ReturnType<typeof seedLiquidityCliFixtures>> & {
 *   pair: string; mintX: string; mintY: string; meteoraOwner: string;
 *   inside: string; outside: string; raydium: { position: string; owner: string };
 * }} */
let fx;

beforeAll(async () => {
  const seeded = await seedLiquidityCliFixtures();
  const meteoraOwner = randomAddress();
  const mintX = randomAddress();
  const mintY = randomAddress();
  const pair = await seedMeteoraPair(seeded.rpcUrl, {
    mintX,
    mintY,
    activeId: 0,
    binStep: 25,
  });
  const inside = await seedMeteoraPosition(seeded.rpcUrl, {
    lbPair: pair,
    owner: meteoraOwner,
    lowerBinId: -1,
    upperBinId: 1,
  });
  const outside = await seedMeteoraPosition(seeded.rpcUrl, {
    lbPair: pair,
    owner: meteoraOwner,
    lowerBinId: 20,
    upperBinId: 22,
  });
  const raydiumOwner = randomAddress();
  const raydiumPool = await seedRaydiumPool(seeded.rpcUrl, {
    mint0: randomAddress(),
    mint1: randomAddress(),
  });
  const raydium = await seedRaydiumPosition(seeded.rpcUrl, {
    poolId: raydiumPool,
    owner: raydiumOwner,
    liquidity: 1n,
  });
  fx = {
    ...seeded,
    pair,
    mintX,
    mintY,
    meteoraOwner,
    inside,
    outside,
    raydium: { position: raydium.position, owner: raydiumOwner },
  };
});

/** @param {Record<string, string>} env @param {string[]} args */
const run = (env, args) => runSolos(args, { ...env, SOLOS_TOOLS: "all" });

/** @param {string} stdout */
const parsed = (stdout) => JSON.parse(stdout);

describe("`solos liquidity pool` and position range [integration]", () => {
  test("a known active bin and bin step yield priceAPerB through CLI and stdio MCP", async () => {
    const { env } = await signerEnv(fx);
    const cli = await run(env, ["liquidity", "pool", "--protocol", "meteora", "--pool", fx.pair]);
    expect(cli.stderr).toBe("");
    expect(cli.code).toBe(0);
    const body = parsed(cli.stdout);
    expect(body).toMatchObject({
      protocol: "meteora",
      pool: fx.pair,
      tokenA: { mint: fx.mintX, decimals: 9 },
      tokenB: { mint: fx.mintY, decimals: 6 },
      activeId: 0,
      binStep: 25,
      priceAPerB: PRICE_AT_BIN_ZERO,
    });
    expect(body.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const mcp = await run(env, [
      "mcp",
      "call",
      "solana_liquidity_get_pool",
      "--args",
      JSON.stringify({ protocol: "meteora", pool: fx.pair }),
    ]);
    expect(mcp.code).toBe(0);
    const content = parsed(mcp.stdout).structuredContent;
    const { at: cliAt, ...cliRest } = body;
    const { at: mcpAt, ...mcpRest } = content;
    expect(mcpRest).toEqual(cliRest);
    expect(cliAt).toMatch(/Z$/);
    expect(mcpAt).toMatch(/Z$/);
  });

  test("a position range contains or excludes the active bin as seeded", async () => {
    const { env } = await signerEnv(fx);
    const read = async (/** @type {string} */ position) => {
      const result = await run(env, [
        "liquidity",
        "position",
        "--protocol",
        "meteora",
        "--position",
        position,
        "--owner",
        fx.meteoraOwner,
      ]);
      expect(result.code).toBe(0);
      return parsed(result.stdout);
    };
    const inside = await read(fx.inside);
    const outside = await read(fx.outside);
    expect(inside.range.lowerBinId).toBeLessThanOrEqual(0);
    expect(inside.range.upperBinId).toBeGreaterThanOrEqual(0);
    expect(outside.range.lowerBinId).toBeGreaterThan(0);
    expect(inside.range).toEqual({ lowerBinId: -1, upperBinId: 1 });
    expect(outside.range).toEqual({ lowerBinId: 20, upperBinId: 22 });
  });

  test("orca and raydium position reads include tickLower and tickUpper", async () => {
    const { env } = await signerEnv(fx);
    const orca = await run(env, [
      "liquidity",
      "position",
      "--protocol",
      "orca",
      "--position",
      fx.funded.position,
      "--owner",
      fx.owner,
    ]);
    expect(orca.code).toBe(0);
    expect(parsed(orca.stdout).range).toEqual({ tickLower: -1000, tickUpper: 1000 });
    const raydium = await run(env, [
      "liquidity",
      "position",
      "--protocol",
      "raydium",
      "--position",
      fx.raydium.position,
      "--owner",
      fx.raydium.owner,
    ]);
    expect(raydium.code).toBe(0);
    expect(parsed(raydium.stdout).range).toEqual({ tickLower: -1000, tickUpper: 1000 });
  });

  test("a non-Meteora pool fails typed on the CLI and over stdio MCP", async () => {
    const { env } = await signerEnv(fx);
    const cli = await run({ ...env, SOLANA_RPC_URL: DEAD_RPC_URL }, [
      "liquidity",
      "pool",
      "--protocol",
      "orca",
      "--pool",
      fx.pair,
    ]);
    expect(cli.code).not.toBe(0);
    expect(stderrJson(cli.stderr)?.error).toMatchObject({
      code: "LiquidityUnsupportedProtocol",
      protocol: "orca",
      reason: "the pool read is Meteora-only",
      remedy: "read the position with solana_liquidity_get_position",
    });
    const mcp = await run(env, [
      "mcp",
      "call",
      "solana_liquidity_get_pool",
      "--args",
      JSON.stringify({ protocol: "raydium", pool: fx.pair }),
    ]);
    expect(mcp.code).not.toBe(0);
    expect(parsed(mcp.stdout).structuredContent).toMatchObject({
      code: "LiquidityUnsupportedProtocol",
      protocol: "raydium",
      reason: "the pool read is Meteora-only",
      remedy: "read the position with solana_liquidity_get_position",
    });
  });
});
