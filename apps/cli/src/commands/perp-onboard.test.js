// @ts-check
import { beforeAll, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { runSolos } from "./cli-fixture.js";
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
