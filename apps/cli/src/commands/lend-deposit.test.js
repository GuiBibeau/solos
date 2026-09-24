// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import {
  positionMarketBytes,
  positionReserveBytes,
  seedKaminoAccount,
  seedVanillaObligation,
} from "@solos/solana/lend/position-fixture";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
  surfnetCheatcodes,
  USDC_MINT,
} from "@solos/solana/surfnet";
import { runSolos } from "./cli-fixture.js";

/** The reserve layout offset of `liquidity.tokenProgram` (pinned klend layout). */
const TOKEN_PROGRAM_OFFSET = 408;
/** The classic SPL Token program, as raw address bytes (kits differ across packages). */
const TOKEN_PROGRAM_BYTES = new Uint8Array([
  6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
  95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */ let surfnet;
/** @type {Record<string, string>} */ let env;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const signerSeed = randomSeed();
  const [market, reserve, receipt] = await Promise.all([
    seedAddress(randomSeed()),
    seedAddress(randomSeed()),
    seedAddress(randomSeed()),
  ]);
  const owner = await seedAddress(signerSeed);
  env = {
    SOLANA_RPC_URL: surfnet.rpcUrl,
    SOLANA_WS_URL: surfnet.wsUrl,
    SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(signerSeed),
    KAMINO_LENDING_MARKET: market,
  };
  const reserveBytes = positionReserveBytes({
    market,
    mint: USDC_MINT,
    receiptMint: receipt,
    available: 10n ** 12n,
    collateralSupply: 10n ** 12n,
    decimals: 6,
  });
  // The fixture leaves the reserve's liquidity token program zeroed; pin the classic one.
  reserveBytes.set(TOKEN_PROGRAM_BYTES, TOKEN_PROGRAM_OFFSET);
  await seedKaminoAccount(surfnet.rpcUrl, market, positionMarketBytes());
  await seedKaminoAccount(surfnet.rpcUrl, reserve, reserveBytes);
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.ensureMint(USDC_MINT, 6);
  await cheats.setMint(receipt, 6);
  await cheats.setTokenAccount(owner, USDC_MINT, 10n ** 9n);
  await seedVanillaObligation(surfnet.rpcUrl, {
    market,
    owner,
    deposits: [{ reserve, amount: 2_000_000n }],
  });
});

/** @param {string} stderr */
const stderrError = (stderr) => {
  const line = stderr.split("\n").find((l) => l.startsWith("{"));
  return line === undefined ? undefined : JSON.parse(line)?.error;
};

describe("`solos lend simulate-deposit` against real chain state [integration]", () => {
  test("a malformed amount fails typed before any chain access", async () => {
    const { stderr, code } = await runSolos(
      ["lend", "simulate-deposit", "--mint", USDC_MINT, "--amount", "0"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrError(stderr)).toMatchObject({ code: "LendingInputInvalid" });
  });

  test("a non-integer amount fails typed", async () => {
    const { stderr, code } = await runSolos(
      ["lend", "simulate-deposit", "--mint", USDC_MINT, "--amount", "1.5"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrError(stderr)).toMatchObject({ code: "LendingInputInvalid" });
  });

  test("an amount above the funded balance is rejected before any simulation", async () => {
    const { stderr, code } = await runSolos(
      ["lend", "simulate-deposit", "--mint", USDC_MINT, "--amount", "999999999999"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrError(stderr)?.code).toBe("BuildRejected");
    expect(stderrError(stderr)?.reason).toContain("insufficient token balance");
  });

  test("the exact simulated transaction runs against the program and fails honestly, sending nothing", async () => {
    const { stderr, code } = await runSolos(
      ["lend", "simulate-deposit", "--mint", USDC_MINT, "--amount", "1000000"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrError(stderr)?.code).toBe("SimulationFailed");
  });
});

describe("`solos lend deposit` gates sends on its own simulation [integration]", () => {
  test("a failed pre-send simulation sends nothing", async () => {
    const { stderr, code } = await runSolos(
      ["lend", "deposit", "--mint", USDC_MINT, "--amount", "1000000"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrError(stderr)?.code).toBe("SimulationFailed");
  });
});

describe("`solos lend withdraw` and real MCP child [integration]", () => {
  test("CLI withdrawal fails typed before execution when supply is insufficient", async () => {
    const { stderr, code } = await runSolos(
      ["lend", "withdraw", "--mint", USDC_MINT, "--amount", "3000000"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrError(stderr)?.code).toBe("BuildRejected");
  });

  test("simulation CLI and real stdio MCP tool reach the signed protocol path", async () => {
    const cli = await runSolos(
      ["lend", "simulate-withdraw", "--mint", USDC_MINT, "--amount", "1000000"],
      env,
    );
    expect(cli.code).not.toBe(0);
    expect(stderrError(cli.stderr)?.code).toBe("SimulationFailed");
    const mcp = await runSolos(
      [
        "mcp",
        "call",
        "solana_lend_simulate_withdraw",
        "--args",
        JSON.stringify({ mint: USDC_MINT, amount: "1000000" }),
      ],
      env,
    );
    expect(mcp.code).not.toBe(0);
    expect(mcp.stdout).toContain("SimulationFailed");
  }, 15_000);
});

describe("`solos mcp list` exposes the deposit and withdrawal twins [integration]", () => {
  test("both tools are registered", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], env);
    expect(code).toBe(0);
    expect(stdout).toContain("solana_lend_simulate_deposit");
    expect(stdout).toContain("solana_lend_execute_deposit");
    expect(stdout).toContain("solana_lend_simulate_withdraw");
    expect(stdout).toContain("solana_lend_execute_withdraw");
  });
});
