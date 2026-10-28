// @ts-check
import { describe, expect, test } from "bun:test";
import { jsonRpc, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch } from "./engine-fixture.js";
import {
  bootTrigger,
  bounds,
  clock,
  prices,
  statusOf,
  ticksOf,
  triggerDraft,
} from "./tick-trigger-fixture.js";

/** @param {string} to */
const transfer = (to) => ({ type: "transfer_sol", to, lamports: "1000000" });

/** @param {string} rpcUrl @param {string} address */
const signaturesOf = async (rpcUrl, address) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [address, { limit: 20 }]);
  return /** @type {Array<{ signature: string }>} */ (rows).map((row) => row.signature);
};

describe("trigger ticks on surfpool [integration]", () => {
  test("a below line and an above line each fire once and finish", async () => {
    const feed = prices();
    const time = clock();
    const book = { price: "160" };
    const engine = await bootTrigger(feed, time, book);
    try {
      const belowTo = await seedAddress(randomSeed());
      const below = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "below", priceUsd: "150", action: transfer(belowTo) }),
      });
      expect(below.status).toBe(200);
      time.advance();
      await engine.runDue();
      const waiting = await ticksOf(engine, below.body.id);
      expect(waiting[0].outcome).toBe("evaluated");
      expect(waiting[0].actions).toEqual([]);
      expect(waiting[0].observations.price).toBe("160");
      book.price = "149";
      time.advance();
      await engine.runDue();
      const fired = await ticksOf(engine, below.body.id);
      expect(fired[0].outcome).toBe("executed");
      expect(fired[0].actions).toHaveLength(1);
      expect(fired[0].intents).toHaveLength(1);
      expect(fired[0].intents[0].signature).toEqual(expect.any(String));
      expect(await signaturesOf(engine.surfnet.rpcUrl, engine.signer)).toContain(
        fired[0].intents[0].signature,
      );
      expect(fired[0].observations.price).toBe("149");
      expect(fired[0].state.bestPriceUsd).toBe("149");
      expect((await statusOf(engine, below.body.id)).state).toBe("done");

      const aboveTo = await seedAddress(randomSeed());
      const above = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "above", priceUsd: "170", action: transfer(aboveTo) }),
      });
      book.price = "160";
      time.advance();
      await engine.runDue();
      expect((await ticksOf(engine, above.body.id))[0].outcome).toBe("evaluated");
      book.price = "171";
      time.advance();
      await engine.runDue();
      const crossed = await ticksOf(engine, above.body.id);
      expect(crossed[0].outcome).toBe("executed");
      expect(crossed[0].intents[0].signature).toEqual(expect.any(String));
      expect((await statusOf(engine, above.body.id)).state).toBe("done");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("replaying the fired tick intent does not send a second signature", async () => {
    const feed = prices();
    const time = clock();
    const book = { price: "149" };
    const engine = await bootTrigger(feed, time, book);
    try {
      const to = await seedAddress(randomSeed());
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "below", priceUsd: "150", action: transfer(to) }),
      });
      time.advance();
      await engine.runDue();
      const ticks = await ticksOf(engine, registered.body.id);
      const signature = ticks[0].intents[0].signature;
      const before = await signaturesOf(engine.surfnet.rpcUrl, engine.signer);
      const replay = await engineFetch(engine, "/v1/actions/execute", {
        method: "POST",
        body: {
          action: transfer(to),
          intentId: ticks[0].intents[0].intentId,
          strategyId: registered.body.id,
          tickId: ticks[0].tickId,
        },
      });
      expect(replay.status).toBe(200);
      expect(replay.body.signature).toBe(signature);
      expect(await signaturesOf(engine.surfnet.rpcUrl, engine.signer)).toEqual(before);
      expect(await ticksOf(engine, registered.body.id)).toEqual(ticks);
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("both thresholds, a trailing band, and a repeating trigger without cooldown are refused", async () => {
    const feed = prices();
    const time = clock();
    const engine = await bootTrigger(feed, time, { price: "160", extra: { tier: "simulate" } });
    try {
      const to = await seedAddress(randomSeed());
      const action = transfer(to);
      const both = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({
          condition: "below",
          priceUsd: "150",
          trailingBps: 500,
          action,
        }),
      });
      expect(both.status).toBe(400);
      expect(both.body.error.reason).toContain("priceUsd");
      expect(both.body.error.reason).toContain("trailingBps");
      const band = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "below", trailingBps: 10, action }),
      });
      expect(band.body.error.reason).toContain("trailingBps");
      const open = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "below", priceUsd: "150", action, once: false }),
      });
      expect(open.body.error.reason).toContain("cooldown");
      expect(bounds.maxConsecutiveFailures).toBe(3);
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});
