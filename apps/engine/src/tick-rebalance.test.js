// @ts-check
import { describe, expect, test } from "bun:test";
import { jsonRpc } from "@solos/solana/surfnet";
import { USDC_MINT } from "@solos-sh/actions";
import { runSolos } from "../../cli/src/commands/cli-fixture.js";
import { engineFetch, startTestEngine } from "./engine-fixture.js";
import { clock, ticksOf } from "./tick-trigger-fixture.js";

const USDC = USDC_MINT;
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const BAND = 300;

const PRICES = {
  [JUP]: { usd: "2", decimals: 6 },
  [USDT]: { usd: "1", decimals: 6 },
  [USDC]: { usd: "1", decimals: 6 },
};

const INITIAL = { [JUP]: "500000000", [USDT]: "0", [USDC]: "100000000" };

const priceFeed = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const ids = new URL(request.url).searchParams.get("ids") ?? "";
      const row = PRICES[ids];
      if (row === undefined) return new Response("no price", { status: 500 });
      return Response.json({
        [ids]: { usdPrice: Number(row.usd), blockId: 1, decimals: row.decimals, priceChange24h: 0 },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @param {string} rpcUrl @param {string} owner @param {string} mint */
const tokenAmount = async (rpcUrl, owner, mint) => {
  const result = await jsonRpc(rpcUrl, "getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  let total = 0n;
  const rows = result.value ?? [];
  for (const row of rows) {
    const amount = row?.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (typeof amount === "string") total += BigInt(amount);
  }
  return total;
};

/** @param {bigint} amount @param {number} price */
const usd = (amount, price) => (Number(amount) * price) / 1e6;

describe("rebalance ticks on surfpool [integration]", () => {
  test("one tick swaps back inside the band and status shows weight, target, and drift", async () => {
    const feed = priceFeed();
    const time = clock();
    const engine = await startTestEngine({
      strategies: true,
      tier: "execute",
      allowedMints: [],
      now: time.now,
      quote: (action) => ({
        reserveUsd: "10",
        actualUsd: "10",
        mint: action.type === "swap" ? action.inputMint : USDC,
      }),
      swapFixture: { rpcUrl: feed.url, prices: PRICES, balances: { ...INITIAL } },
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
    try {
      await seed(engine);
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft(),
      });
      expect(registered.status).toBe(200);
      time.advance();
      await engine.runDue();
      const ticks = await ticksOf(engine, registered.body.id);
      expect(ticks[0].outcome).toBe("executed");
      expect(ticks[0].actions).toHaveLength(2);
      expect(ticks[0].intents).toHaveLength(2);
      const signatures = await signerSignatures(engine.surfnet.rpcUrl, engine.signer);
      const intents = ticks[0].intents;
      for (const intent of intents) {
        expect(intent.state).toBe("settled");
        expect(signatures).toContain(intent.signature);
      }
      const status = JSON.parse(
        (
          await runSolos(
            ["strategy", "status", registered.body.id],
            {
              SOLOS_ENGINE_URL: engine.url,
              SOLOS_ENGINE_TOKEN: engine.token,
              SOLOS_LOG_LEVEL: "warn",
              SOLANA_RPC_URL: engine.surfnet.rpcUrl,
              SOLANA_WS_URL: engine.surfnet.wsUrl,
            },
            { features: ["STRATEGIES"] },
          )
        ).stdout,
      );
      expect(status.lastTick.actions).toHaveLength(2);
      expect(
        status.lastTick.intents.map((/** @type {{ state: string }} */ row) => row.state),
      ).toEqual(["settled", "settled"]);
      const jup = status.lastTick.state.mints[JUP];
      expect(jup.target).toBe("0.5");
      expect(typeof jup.weight).toBe("string");
      expect(jup.driftBps).toBeGreaterThan(BAND);
      await expectInsideBand(engine);
      time.advance();
      await engine.runDue();
      const again = await ticksOf(engine, registered.body.id);
      expect(again[0].outcome).toBe("evaluated");
      expect(again[0].actions).toEqual([]);
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});

const draft = () => ({
  owner: "swarm",
  kind: "rebalance",
  params: {
    targets: { [JUP]: "0.5", [USDT]: "0.2", [USDC]: "0.3" },
    bandBps: BAND,
    minTradeUsd: "1",
  },
  tickSource: { type: "clock", every: 60_000 },
  bounds: {
    maxNotionalPerTickUsd: "100000",
    maxDailySpendUsd: "100000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
  },
});

/** @param {{ surfnet: { cheats: { ensureMint: Function; setTokenAccount: Function } }; signer: string }} engine */
const seed = async (engine) => {
  await engine.surfnet.cheats.ensureMint(JUP, 6);
  await engine.surfnet.cheats.ensureMint(USDT, 6);
  await engine.surfnet.cheats.ensureMint(USDC, 6);
  await engine.surfnet.cheats.setTokenAccount(engine.signer, JUP, INITIAL[JUP]);
  await engine.surfnet.cheats.setTokenAccount(engine.signer, USDC, INITIAL[USDC]);
};

/** @param {string} rpcUrl @param {string} owner */
const signerSignatures = async (rpcUrl, owner) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [owner, { limit: 20 }]);
  return rows.map((/** @type {{ signature: string }} */ row) => row.signature);
};

/** @param {{ surfnet: { rpcUrl: string }; signer: string }} engine */
const expectInsideBand = async (engine) => {
  const jup = await tokenAmount(engine.surfnet.rpcUrl, engine.signer, JUP);
  const usdt = await tokenAmount(engine.surfnet.rpcUrl, engine.signer, USDT);
  const usdc = await tokenAmount(engine.surfnet.rpcUrl, engine.signer, USDC);
  const total = usd(jup, 2) + usd(usdt, 1) + usd(usdc, 1);
  const drift = (value, target) => Math.abs(value / total - target) * 10_000;
  expect(drift(usd(jup, 2), 0.5)).toBeLessThanOrEqual(BAND);
  expect(drift(usd(usdt, 1), 0.2)).toBeLessThanOrEqual(BAND);
  expect(drift(usd(usdc, 1), 0.3)).toBeLessThanOrEqual(BAND);
};
