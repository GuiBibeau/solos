// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "@solos/solana/surfnet";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT } from "@solos/solana/swap/build-bodies";
import { startBuildFixture } from "@solos/solana/swap/build-http-fixture";
import { runSolos, solanaEnv, stderrJson } from "./swap-quote-fixture.js";

/**
 * `solos swap simulate` and `solos swap execute --skip-simulation` through real child
 * processes: both reach the loopback Jupiter build fixture with the child's own taker, and —
 * because an offline Surfnet has no Jupiter program — they report the honest domain failures
 * (SimulationFailed before anything is sent; TransactionFailed preserving the signature of the
 * one submission). A missing key fails pre-HTTP with zero requests; `solos mcp call` reaches
 * the fixture through the actual server child.
 */

const swapArgs = ["--input-mint", INPUT_MINT, "--output-mint", OUTPUT_MINT, "--amount", AMOUNT];

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startBuildFixture>} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startBuildFixture();
});

afterAll(() => fixture?.stop());

/**
 * Child env with a fresh throwaway signer: the returned address is that signer.
 * @param {{ jupiter?: boolean }} [options]
 * @returns {Promise<{ env: Record<string, string>; taker: string }>}
 */
const childEnv = async ({ jupiter = true } = {}) => {
  const seed = randomSeed();
  return {
    env: {
      ...(await solanaEnv(surfnet)),
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
      ...(jupiter && { JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url }),
    },
    taker: await seedAddress(seed),
  };
};

describe("`solos swap simulate/execute` through real child processes [integration]", () => {
  // Slow multi-child test: an explicit 60s budget, matching the repo-wide `bun test --timeout`.
  test("swap simulate reaches the fixture and reports SimulationFailed without sending", {
    timeout: 60_000,
  }, async () => {
    const { env, taker } = await childEnv();
    const { stderr, code } = await runSolos(["swap", "simulate", ...swapArgs], env);
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error?.code).toBe("SimulationFailed");
    expect(fixture.requests).toHaveLength(1);
    const request = fixture.requests[0];
    expect(request?.taker).toBe(taker);
    expect(request?.key).toBe(KEY);
    expect(request?.payer).toBeNull();
    expect(request?.tipAmount).toBeNull();
    expect(request?.amount).toBe(AMOUNT);
    expect(request?.url.includes(KEY)).toBe(false);
  });

  test("swap execute --skip-simulation submits exactly once and preserves the signature", {
    timeout: 60_000,
  }, async () => {
    const { env, taker } = await childEnv();
    await surfnet.cheats.fundSol(taker, 1);
    const builds = fixture.requests.length;
    const { stderr, code } = await runSolos(
      ["swap", "execute", ...swapArgs, "--skip-simulation"],
      env,
    );
    expect(code).toBe(1);
    const payload = stderrJson(stderr);
    expect(payload?.error?.code).toBe("TransactionFailed");
    expect(typeof payload?.error?.signature).toBe("string");
    expect(payload?.error?.signature.length).toBeGreaterThan(40);
    expect(fixture.requests.length).toBe(builds + 1);
    expect(fixture.requests.at(-1)?.taker).toBe(taker);
  });

  test("mcp call reaches the fixture through the real server child", {
    timeout: 60_000,
  }, async () => {
    const { env } = await childEnv();
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_swap_simulate_swap",
        "--args",
        JSON.stringify({ inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT }),
      ],
      env,
    );
    // `solos mcp call` exits non-zero when the tool reports a domain error, honestly.
    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.code).toBe("SimulationFailed");
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("a missing Jupiter key exits 1 pre-HTTP with zero build requests", {
    timeout: 60_000,
  }, async () => {
    const { env } = await childEnv({ jupiter: false });
    const before = fixture.requests.length;
    const { stderr, code } = await runSolos(["swap", "execute", ...swapArgs], env);
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error?.code).toBe("BuildUnavailable");
    expect(stderrJson(stderr)?.error?.reason).toContain("JUPITER_API_KEY");
    expect(fixture.requests.length).toBe(before);
  });
});
