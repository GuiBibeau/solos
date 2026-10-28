// @ts-check
import { describe, expect, test } from "bun:test";
import { surfnetCheatcodes } from "@solos/solana/surfnet";
import { runSolos } from "../../cli/src/commands/cli-fixture.js";
import { engineFetch, startTestEngine } from "./engine-fixture.js";
import { clock, prices, ticksOf } from "./tick-trigger-fixture.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPOT = "So11111111111111111111111111111111111111112";

/**
 * @typedef {{ apr: string; side: string; size: string; spotBalance: string }} Book
 */

/** @param {Book} book */
const observations = (book) => ({
  currentAprPct: book.apr,
  markPriceUsd: "150",
  fundingAt: "2026-10-28T00:00:00.000Z",
  fundingHistory: "[]",
  perpSide: book.side,
  perpSize: book.size,
  perpNotionalUsd: "",
  onboarded: 1,
  equityUsd: "1000",
  freeCollateralUsd: "",
  spotBalance: book.spotBalance,
  spotDecimals: 9,
  quoteBalance: "1000000000",
  quoteDecimals: 6,
  spotPriceUsd: "150",
  quotePriceUsd: "1",
  quoteMint: USDC,
});

const draft = () => ({
  owner: "swarm",
  kind: "carry",
  params: {
    market: "SOL-PERP",
    spotMint: SPOT,
    notionalUsd: "100",
    entryHurdleAprPct: "10",
    exitHurdleAprPct: "4",
    lookbackHours: 24,
    expectedHoldHours: 24,
    roundTripCostPct: "0",
  },
  tickSource: { type: "clock", every: 60_000 },
  bounds: {
    maxNotionalPerTickUsd: "1000",
    maxDailySpendUsd: "5000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
  },
});

describe("carry ticks on surfpool [integration]", () => {
  test("enters on paper, exits on paper, and status shows the carry", async () => {
    const feed = prices();
    const time = clock();
    /** @type {Book} */
    const book = { apr: "20", side: "flat", size: "0", spotBalance: "0" };
    const engine = await startTestEngine({
      strategies: true,
      tier: "execute",
      allowedMints: [],
      now: time.now,
      observations: () => observations(book),
      quote: () => ({ reserveUsd: "1", actualUsd: "1", mint: USDC }),
      settleAction: (action) => ({ state: "settled", signature: action.type }),
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
    try {
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft(),
      });
      expect(registered.status).toBe(200);
      const id = registered.body.id;
      const cheats = surfnetCheatcodes(engine.surfnet.rpcUrl);
      await cheats.ensureMint(USDC, 6);
      await cheats.ensureMint(SPOT, 9);
      time.advance();
      await engine.runDue();
      const entered = await ticksOf(engine, id);
      expect(entered[0].outcome).toBe("executed");
      expect(entered[0].actions.map((/** @type {{ type: string }} */ row) => row.type)).toEqual([
        "open_perp",
        "swap",
      ]);
      expect(entered[0].state).toMatchObject({
        trailingMeanAprPct: "20",
        entryHurdleAprPct: "10",
        exitHurdleAprPct: "4",
        breakEvenAprPct: "0",
        spotAmount: "666666666",
        side: "short",
        market: "SOL-PERP",
      });
      expect(entered[0].state.entryAt).toEqual(expect.any(Number));
      const status = await strategyStatus(engine, id);
      expect(status.state).toBe("active");
      expect(status.lastTick.state).toMatchObject({
        trailingMeanAprPct: "20",
        entryHurdleAprPct: "10",
        breakEvenAprPct: "0",
        spotAmount: "666666666",
        entryAt: entered[0].state.entryAt,
      });
      expect(status.lastTick.note).toContain("breakEvenAprPct 0");
      book.apr = "1";
      book.side = "short";
      book.size = "10";
      book.spotBalance = entered[0].state.spotAmount;
      time.advance();
      await engine.runDue();
      const exited = await ticksOf(engine, id);
      expect(exited[0].outcome).toBe("executed");
      expect(exited[0].actions.map((/** @type {{ type: string }} */ row) => row.type)).toEqual([
        "close_perp",
        "swap",
      ]);
      expect(exited[0].actions[1]).toMatchObject({
        inputMint: SPOT,
        outputMint: USDC,
        amount: "666666666",
      });
      expect(exited[0].state.entryAt).toBe(entered[0].state.entryAt);
      const after = await strategyStatus(engine, id);
      expect(after.lastTick.state.trailingMeanAprPct).toBe("1");
      expect(after.lastTick.state.entryAt).toBe(entered[0].state.entryAt);
      expect(after.lastTick.note).toContain("exitHurdleAprPct 4");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});

/**
 * @param {{ url: string; token: string; surfnet: { rpcUrl: string; wsUrl: string }; privateKey: string }} engine
 * @param {string} id
 */
const strategyStatus = async (engine, id) => {
  const printed = await runSolos(["strategy", "status", id], childEnv(engine), {
    features: ["STRATEGIES"],
  });
  expect(printed.code).toBe(0);
  return JSON.parse(printed.stdout);
};

/**
 * @param {{ url: string; token: string; surfnet: { rpcUrl: string; wsUrl: string }; privateKey: string }} engine
 */
const childEnv = (engine) => ({
  SOLOS_ENGINE_URL: engine.url,
  SOLOS_ENGINE_TOKEN: engine.token,
  SOLOS_LOG_LEVEL: "warn",
  SOLOS_SIGNER_PRIVATE_KEY: engine.privateKey,
  SOLANA_RPC_URL: engine.surfnet.rpcUrl,
  SOLANA_WS_URL: engine.surfnet.wsUrl,
});
