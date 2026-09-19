// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { randomAddress } from "@solos/solana/liquidity/whirlpool-fixture";
import { runSolos, stderrJson } from "./cli-fixture.js";
import {
  DEAD_RPC_URL,
  LIQUIDITY,
  seedLiquidityCliFixtures,
  signerEnv,
} from "./liquidity-fixture.js";

/** @type {Awaited<ReturnType<typeof seedLiquidityCliFixtures>>} */
let fx;

beforeAll(async () => {
  fx = await seedLiquidityCliFixtures();
});

describe("`solos liquidity position` through a real CLI child process [integration]", () => {
  test("prints the LpPosition contract JSON and resolves the omitted owner to the signer", async () => {
    const { address, env } = await signerEnv(fx);
    // Custody the position NFT for this child's fresh signer before it runs.
    const { seedWhirlpoolPosition } = await import("@solos/solana/liquidity/whirlpool-fixture");
    const seeded = await seedWhirlpoolPosition(fx.rpcUrl, {
      pool: fx.pool.pool,
      owner: address,
      liquidity: LIQUIDITY,
    });
    const { stdout, stderr, code } = await runSolos(
      ["liquidity", "position", "--protocol", "orca", "--position", seeded.position],
      env,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      kind: "lp",
      protocol: "orca",
      position: seeded.position,
      instrument: fx.pool.pool,
      liquidity: LIQUIDITY.toString(),
      tokenA: { mint: fx.pool.mintA, decimals: 6 },
      tokenB: { mint: fx.pool.mintB, decimals: 9 },
      valueUsd: null,
    });
  });

  test("reads an explicit owner's zero-liquidity position as a successful zero read", async () => {
    const { env } = await signerEnv(fx);
    const { stdout, stderr, code } = await runSolos(
      [
        "liquidity",
        "position",
        "--protocol",
        "orca",
        "--position",
        fx.empty.position,
        "--owner",
        fx.owner,
      ],
      env,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      position: fx.empty.position,
      liquidity: "0",
      tokenA: { amount: "0" },
      tokenB: { amount: "0" },
      valueUsd: null,
    });
  });

  test("a nonexistent position exits non-zero with LiquidityPositionUnavailable", async () => {
    const { env } = await signerEnv(fx);
    const absent = randomAddress();
    const { stdout, stderr, code } = await runSolos(
      ["liquidity", "position", "--protocol", "orca", "--position", absent],
      env,
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "LiquidityPositionUnavailable",
      position: absent,
      reason: "no account at the position address",
    });
  });

  test("meteora fails typed before any network access on a dead RPC URL", async () => {
    const { env } = await signerEnv(fx);
    const { stdout, stderr, code } = await runSolos(
      [
        "liquidity",
        "position",
        "--protocol",
        "meteora",
        "--position",
        fx.funded.position,
        "--owner",
        fx.owner,
      ],
      { ...env, SOLANA_RPC_URL: DEAD_RPC_URL },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "LiquidityUnsupportedProtocol",
      protocol: "meteora",
    });
  });

  test("an unknown protocol value fails input validation before anything else", async () => {
    const { env } = await signerEnv(fx);
    const { stderr, code } = await runSolos(
      ["liquidity", "position", "--protocol", "jupiter", "--position", fx.funded.position],
      { ...env, SOLANA_RPC_URL: DEAD_RPC_URL },
    );
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "LiquidityInputInvalid" });
  });
});
