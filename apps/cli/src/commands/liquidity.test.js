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

  test("reads a meteora position for an explicit owner", async () => {
    const { env } = await signerEnv(fx);
    const { randomAddress } = await import("@solos/solana/liquidity/whirlpool-fixture");
    const { seedMeteoraBinArray, seedMeteoraPair, seedMeteoraPosition } = await import(
      "@solos/solana/liquidity/meteora-dlmm-seeds"
    );
    const owner = randomAddress();
    const mintX = randomAddress();
    const mintY = randomAddress();
    const pair = await seedMeteoraPair(fx.rpcUrl, { mintX, mintY });
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: pair,
      owner,
      lowerBinId: -1,
      upperBinId: 0,
      shares: [
        { index: 0, share: 3n },
        { index: 1, share: 5n },
      ],
    });
    await seedMeteoraBinArray(fx.rpcUrl, {
      lbPair: pair,
      index: -1,
      bins: [{ binId: -1, amountX: 0n, amountY: 10n, supply: 4n }],
    });
    await seedMeteoraBinArray(fx.rpcUrl, {
      lbPair: pair,
      index: 0,
      bins: [{ binId: 0, amountX: 10n, amountY: 1n, supply: 8n }],
    });
    const { stdout, stderr, code } = await runSolos(
      ["liquidity", "position", "--protocol", "meteora", "--position", position, "--owner", owner],
      env,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      kind: "lp",
      protocol: "meteora",
      position,
      instrument: pair,
      liquidity: "8",
      tokenA: { mint: mintX, amount: "6", decimals: 9 },
      tokenB: { mint: mintY, amount: "7", decimals: 6 },
      valueUsd: null,
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

describe("`solos liquidity simulate-deposit` and `deposit` through a real CLI child [integration]", () => {
  test("a position/pool mismatch exits non-zero with BuildRejected before any simulation", async () => {
    const { address, env } = await signerEnv(fx);
    const { seedWhirlpoolPosition } = await import("@solos/solana/liquidity/whirlpool-fixture");
    const seeded = await seedWhirlpoolPosition(fx.rpcUrl, {
      pool: fx.pool.pool,
      owner: address,
      liquidity: 0n,
    });
    const { stdout, stderr, code } = await runSolos(
      [
        "liquidity",
        "simulate-deposit",
        "--protocol",
        "orca",
        "--pool",
        fx.pool.mintA,
        "--position",
        seeded.position,
        "--amount-a",
        "1000000000",
        "--amount-b",
        "1000000000",
      ],
      env,
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "BuildRejected" });
    expect(stderrJson(stderr)?.error.reason).toContain("different pool");
  });

  test("simulate-deposit on a seeded family reaches the chain simulation and fails honestly", async () => {
    const { address, env } = await signerEnv(fx);
    const { seedWhirlpoolPosition } = await import("@solos/solana/liquidity/whirlpool-fixture");
    const { surfnetCheatcodes } = await import("@solos/solana/surfnet");
    const seeded = await seedWhirlpoolPosition(fx.rpcUrl, {
      pool: fx.pool.pool,
      owner: address,
      liquidity: 0n,
    });
    const cheats = surfnetCheatcodes(fx.rpcUrl);
    await cheats.setTokenAccount(address, fx.pool.mintA, 10n ** 12n);
    await cheats.setTokenAccount(address, fx.pool.mintB, 10n ** 12n);
    const { stdout, stderr, code } = await runSolos(
      [
        "liquidity",
        "simulate-deposit",
        "--protocol",
        "orca",
        "--pool",
        fx.pool.pool,
        "--position",
        seeded.position,
        "--amount-a",
        "1000000000",
        "--amount-b",
        "1000000000",
      ],
      env,
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "SimulationFailed" });
  });

  test("deposit and simulate-deposit for meteora are not refused before the network", async () => {
    const { env } = await signerEnv(fx);
    for (const verb of ["simulate-deposit", "deposit"]) {
      const { stderr, code } = await runSolos(
        [
          "liquidity",
          verb,
          "--protocol",
          "meteora",
          "--pool",
          fx.pool.pool,
          "--position",
          fx.funded.position,
          "--amount-a",
          "1",
          "--amount-b",
          "1",
        ],
        { ...env, SOLANA_RPC_URL: DEAD_RPC_URL },
      );
      expect(code, verb).not.toBe(0);
      expect(stderrJson(stderr)?.error?.code, verb).not.toBe("LiquidityUnsupportedProtocol");
    }
  });

  test("all-zero budgets fail input validation before any network access", async () => {
    const { env } = await signerEnv(fx);
    const { stderr, code } = await runSolos(
      [
        "liquidity",
        "simulate-deposit",
        "--protocol",
        "orca",
        "--pool",
        fx.pool.pool,
        "--position",
        fx.funded.position,
        "--amount-a",
        "0",
        "--amount-b",
        "0",
      ],
      { ...env, SOLANA_RPC_URL: DEAD_RPC_URL },
    );
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "LiquidityInputInvalid" });
  });
});
