// @ts-check
import { beforeAll, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { runSolos, stderrJson } from "./cli-fixture.js";
import { signerEnv, startPerpFixture } from "./perp-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
beforeAll(async () => {
  surfnet = await ensureSurfnet();
});

/** @param {string} authority */
const ready = (authority) => ({
  authority,
  traderPdaIndex: 0,
  snapshot: {
    capabilities: {
      state: "active",
      capabilities: {
        placeMarketOrder: { immediate: true },
        riskIncreasingTrade: { immediate: true },
        depositCollateral: { immediate: true },
      },
    },
    subaccounts: [{ subaccountIndex: 0, collateral: "0" }],
  },
});

test("CLI onboarding [integration] reports a ready trader without submitting registration", async () => {
  const fixture = startPerpFixture({ trader: ready });
  try {
    const { env } = await signerEnv(surfnet, fixture.url);
    const { stdout, code } = await runSolos(["perp", "onboard"], env);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).status).toBe("already_ready");
    expect(fixture.requests.map((entry) => entry.path)).toEqual([
      expect.stringMatching(/^\/v1\/trader\/state\//),
    ]);
  } finally {
    fixture.stop();
  }
});

test("CLI collateral [integration] rejects invalid amounts before any Phoenix or RPC request", async () => {
  const fixture = startPerpFixture({ trader: ready });
  try {
    const { env } = await signerEnv(surfnet, fixture.url);
    for (const command of [
      "simulate-deposit",
      "deposit",
      "simulate-withdraw-collateral",
      "withdraw-collateral",
    ]) {
      const { stderr, code } = await runSolos(["perp", command, "--amount", "0"], env);
      expect(code).not.toBe(0);
      expect(stderrJson(stderr)?.error.code).toBe("PerpInputInvalid");
    }
    expect(fixture.requests).toHaveLength(0);
  } finally {
    fixture.stop();
  }
});

test("CLI and stdio MCP collateral twins [integration] reject an unenrolled signer before sending", async () => {
  const fixture = startPerpFixture({ traderStatus: 404 });
  try {
    const { env } = await signerEnv(surfnet, fixture.url);
    for (const command of [
      "simulate-deposit",
      "deposit",
      "simulate-withdraw-collateral",
      "withdraw-collateral",
    ]) {
      const { stderr, code } = await runSolos(["perp", command, "--amount", "1000000"], env);
      expect(code).not.toBe(0);
      expect(stderrJson(stderr)?.error.code).toBe("BuildRejected");
    }
    for (const tool of [
      "solana_perp_simulate_deposit_collateral",
      "solana_perp_execute_deposit_collateral",
      "solana_perp_simulate_withdraw_collateral",
      "solana_perp_execute_withdraw_collateral",
    ]) {
      const { stdout, code } = await runSolos(
        ["mcp", "call", tool, "--args", JSON.stringify({ amount: "1000000" })],
        env,
      );
      expect(code).not.toBe(0);
      expect(JSON.parse(stdout).structuredContent).toMatchObject({
        code: "BuildRejected",
        reason: expect.stringContaining("Enroll the current wallet"),
      });
    }
    expect(fixture.requests).toHaveLength(8);
    expect(fixture.requests.every((entry) => /^\/v1\/trader\/state\//.test(entry.path))).toBe(true);
  } finally {
    fixture.stop();
  }
}, 15_000);

test("CLI onboarding [integration] distinguishes an absent trader before any signed send", async () => {
  const fixture = startPerpFixture({ traderStatus: 404 });
  try {
    const { env } = await signerEnv(surfnet, fixture.url);
    const { stdout, code } = await runSolos(["perp", "onboarding-status"], env);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ state: "unregistered", trader: null });
    expect(fixture.requests).toHaveLength(1);
  } finally {
    fixture.stop();
  }
});
