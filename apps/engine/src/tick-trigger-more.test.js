// @ts-check
import { describe, expect, test } from "bun:test";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch } from "./engine-fixture.js";
import {
  EVERY,
  SOL,
  bootTrigger,
  bounds,
  clock,
  prices,
  statusOf,
  ticksOf,
  triggerDraft,
} from "./tick-trigger-fixture.js";

/** @param {string} to @param {string} [lamports] */
const transfer = (to, lamports = "1000000") => ({ type: "transfer_sol", to, lamports });

/**
 * @param {ReturnType<typeof clock>} time
 * @param {{ runDue: () => Promise<unknown> }} engine
 * @param {number} steps
 */
const due = async (time, engine, steps) => {
  for (let step = 0; step < steps; step += 1) {
    time.advance();
    await engine.runDue();
  }
};

describe("trigger trailing, cooldown, and refusals [integration]", () => {
  test("a trailing stop and a trailing entry fire on the scripted move", async () => {
    const feed = prices();
    const time = clock();
    const book = { price: "160" };
    const engine = await bootTrigger(feed, time, book);
    try {
      const to = await seedAddress(randomSeed());
      const stop = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "below", trailingBps: 500, action: transfer(to) }),
      });
      const path = ["160", "170", "180", "172"];
      for (const price of path) {
        book.price = price;
        await due(time, engine, 1);
      }
      const tracked = (await ticksOf(engine, stop.body.id)).toReversed();
      expect(
        tracked.map(
          (/** @type {{ state: { bestPriceUsd: string } }} */ row) => row.state.bestPriceUsd,
        ),
      ).toEqual(["160", "170", "180", "180"]);
      expect(tracked[3].outcome).toBe("evaluated");
      book.price = "171";
      await due(time, engine, 1);
      const fired = (await ticksOf(engine, stop.body.id))[0];
      expect(fired.outcome).toBe("executed");
      expect(fired.intents[0].signature).toEqual(expect.any(String));
      expect(fired.state.bestPriceUsd).toBe("171");
      expect((await statusOf(engine, stop.body.id)).state).toBe("done");

      const entryTo = await seedAddress(randomSeed());
      const entry = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({
          condition: "above",
          trailingBps: 300,
          action: transfer(entryTo),
        }),
      });
      for (const price of ["110", "100", "102"]) {
        book.price = price;
        await due(time, engine, 1);
      }
      expect((await ticksOf(engine, entry.body.id))[0].outcome).toBe("evaluated");
      expect((await ticksOf(engine, entry.body.id))[0].state.bestPriceUsd).toBe("100");
      book.price = "103";
      await due(time, engine, 1);
      expect((await ticksOf(engine, entry.body.id))[0].outcome).toBe("executed");
      expect((await statusOf(engine, entry.body.id)).state).toBe("done");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("a missing, errored, or stale price skips and leaves the trailing reference", async () => {
    const feed = prices();
    const time = clock();
    /** @type {import("./tick-trigger-fixture.js").PriceBook} */
    const book = { price: "160" };
    const engine = await bootTrigger(feed, time, book);
    try {
      const to = await seedAddress(randomSeed());
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft({ condition: "below", priceUsd: "150", action: transfer(to) }),
      });
      await due(time, engine, 1);
      expect((await ticksOf(engine, registered.body.id))[0].state.bestPriceUsd).toBe("160");
      delete book.price;
      await due(time, engine, 1);
      const missing = (await ticksOf(engine, registered.body.id))[0];
      expect(missing.outcome).toBe("skipped_observation");
      expect(missing.reason).toContain("price");
      expect(missing.state.bestPriceUsd).toBe("160");
      book.price = "160";
      book.error = { reason: "jupiter price feed failed", remedy: "retry the price feed" };
      await due(time, engine, 1);
      const errored = (await ticksOf(engine, registered.body.id))[0];
      expect(errored.outcome).toBe("skipped_observation");
      expect(errored.reason).toBe("jupiter price feed failed");
      expect(errored.state.bestPriceUsd).toBe("160");
      delete book.error;
      book.at = time.now() + EVERY - 2 * EVERY - 1;
      await due(time, engine, 1);
      const stale = (await ticksOf(engine, registered.body.id))[0];
      expect(stale.outcome).toBe("skipped_observation");
      expect(stale.reason).toContain("older than the staleness limit");
      expect(stale.state.bestPriceUsd).toBe("160");
      expect(stale.observations.price).toBe("160");
      delete book.at;
      book.price = "149";
      await due(time, engine, 1);
      expect((await ticksOf(engine, registered.body.id))[0].outcome).toBe("executed");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("cooldown re-arms, a failed fire stays armed, and bounds keep the trigger armed", async () => {
    const feed = prices();
    const time = clock();
    const book = {
      price: "149",
      quote: { reserveUsd: "2", actualUsd: "1", mint: SOL, solPriceUsd: "150" },
    };
    const engine = await bootTrigger(feed, time, book);
    try {
      const to = await seedAddress(randomSeed());
      const repeating = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft(
          {
            condition: "below",
            priceUsd: "150",
            action: transfer(to),
            once: false,
            cooldown: "10m",
          },
          { bounds: { ...bounds, maxConsecutiveFailures: 3 } },
        ),
      });
      await due(time, engine, 1);
      const first = (await ticksOf(engine, repeating.body.id))[0];
      expect(first.outcome).toBe("executed");
      expect(first.state.bestPriceUsd).toBe("149");
      expect((await statusOf(engine, repeating.body.id)).state).toBe("active");
      book.price = "140";
      await due(time, engine, 9);
      const cooled = await ticksOf(engine, repeating.body.id);
      expect(
        cooled
          .slice(0, 9)
          .every(
            (/** @type {{ outcome: string; actions: unknown[] }} */ row) =>
              row.outcome === "evaluated" && row.actions.length === 0,
          ),
      ).toBe(true);
      expect(cooled[0].state.bestPriceUsd).toBe("149");
      await due(time, engine, 1);
      expect((await ticksOf(engine, repeating.body.id))[0].outcome).toBe("executed");

      const failing = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft(
          { condition: "below", priceUsd: "150", action: transfer(to, "5000000000") },
          { bounds: { ...bounds, maxConsecutiveFailures: 2 } },
        ),
      });
      await due(time, engine, 1);
      const failed = (await ticksOf(engine, failing.body.id))[0];
      expect(failed.outcome).toBe("failed");
      expect((await statusOf(engine, failing.body.id)).state).toBe("active");
      await due(time, engine, 1);
      expect((await statusOf(engine, failing.body.id)).state).toBe("paused");

      book.quote = { reserveUsd: "50", actualUsd: "1", mint: SOL, solPriceUsd: "150" };
      const refused = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: triggerDraft(
          { condition: "below", priceUsd: "150", action: transfer(to) },
          { bounds: { ...bounds, maxNotionalPerTickUsd: "1" } },
        ),
      });
      book.price = "160";
      await due(time, engine, 1);
      expect((await ticksOf(engine, refused.body.id))[0].state.bestPriceUsd).toBe("160");
      book.price = "149";
      await due(time, engine, 1);
      const bounded = (await ticksOf(engine, refused.body.id))[0];
      expect(bounded.outcome).toBe("skipped_bounds");
      expect(bounded.state.bestPriceUsd).toBe("160");
      expect((await statusOf(engine, refused.body.id)).state).toBe("active");
      await due(time, engine, 1);
      expect((await ticksOf(engine, refused.body.id))[0].outcome).toBe("skipped_bounds");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});
