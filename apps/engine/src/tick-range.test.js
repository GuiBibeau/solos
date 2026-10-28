// @ts-check
import { describe, expect, test } from "bun:test";
import { seedMeteoraPair, seedMeteoraPosition } from "@solos/solana/liquidity/meteora-dlmm-seeds";
import { randomAddress } from "@solos/solana/liquidity/whirlpool-fixture";
import { jsonRpc } from "@solos/solana/surfnet";
import { runSolos } from "../../cli/src/commands/cli-fixture.js";
import { engineFetch, startTestEngine } from "./engine-fixture.js";
import { clock, prices, ticksOf } from "./tick-trigger-fixture.js";

const SYSTEM = "11111111111111111111111111111111";
const WIDTH = 5;
const MOVED = 40;

/**
 * @typedef {{
 *   rpcUrl: string;
 *   signer: string;
 *   pair: string;
 *   mintX: string;
 * }} World
 */

/** @param {World} world @param {import("@solos-sh/actions").Action} action */
const settle = async (world, action) => {
  if (action.type === "remove_liquidity") {
    return {
      state: /** @type {const} */ ("settled"),
      signature: "remove",
      details: { amountA: "1000", amountB: "2000" },
    };
  }
  if (action.type === "close_position") {
    await jsonRpc(world.rpcUrl, "surfnet_setAccount", [
      action.position,
      { lamports: 0, data: "", owner: SYSTEM, executable: false },
    ]);
    return { state: /** @type {const} */ ("settled"), signature: "close" };
  }
  if (action.type === "open_position") {
    const position = randomAddress();
    await seedMeteoraPosition(world.rpcUrl, {
      position,
      lbPair: world.pair,
      owner: world.signer,
      lowerBinId: action.lowerBinId ?? 0,
      upperBinId: (action.lowerBinId ?? 0) + (action.width ?? WIDTH) - 1,
    });
    return { state: /** @type {const} */ ("settled"), signature: "open", details: { position } };
  }
  return { state: /** @type {const} */ ("settled"), signature: "add" };
};

describe("range ticks on surfpool [integration]", () => {
  test("a position recenters when the active bin leaves its range", async () => {
    const feed = prices();
    const time = clock();
    /** @type {World} */
    const world = { rpcUrl: "", signer: "", pair: "", mintX: "" };
    const engine = await startTestEngine({
      strategies: true,
      tier: "execute",
      allowedMints: [],
      now: time.now,
      quote: () => ({ reserveUsd: "1", actualUsd: "0", mint: world.mintX }),
      settleAction: (action) => settle(world, action),
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
    world.rpcUrl = engine.surfnet.rpcUrl;
    world.signer = engine.signer;
    try {
      const seeded = await seedPair(engine.surfnet.rpcUrl, engine.signer, 0);
      world.pair = seeded.pair;
      world.mintX = seeded.mintX;
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft(seeded.pair, seeded.position),
      });
      expect(registered.status).toBe(200);
      const id = registered.body.id;
      time.advance();
      await engine.runDue();
      const inside = await ticksOf(engine, id);
      expect(inside[0].outcome).toBe("evaluated");
      expect(inside[0].state.outsideStreak).toBe(0);
      await seedMeteoraPair(engine.surfnet.rpcUrl, {
        pair: seeded.pair,
        mintX: seeded.mintX,
        mintY: seeded.mintY,
        activeId: MOVED,
        binStep: 10,
      });
      time.advance();
      await engine.runDue();
      const waiting = await ticksOf(engine, id);
      expect(waiting[0].outcome).toBe("evaluated");
      expect(waiting[0].actions).toEqual([]);
      expect(waiting[0].state.outsideStreak).toBe(1);
      time.advance();
      await engine.runDue();
      const fired = await ticksOf(engine, id);
      expect(fired[0].outcome).toBe("executed");
      expect(fired[0].actions.map((/** @type {{ type: string }} */ row) => row.type)).toEqual([
        "remove_liquidity",
        "close_position",
        "open_position",
        "add_liquidity",
      ]);
      const status = await strategyStatus(engine, id);
      expect(status.state).toBe("active");
      expect(status.params.position).not.toBe(seeded.position);
      expect(status.lastTick.state).toMatchObject({
        activeId: MOVED,
        lowerBinId: MOVED - 2,
        upperBinId: MOVED + 2,
        outsideStreak: 0,
        recentersToday: 1,
        position: status.params.position,
      });
      expect(status.lastTick.state.lastRecenterIntents).toHaveLength(4);
      const opened = await readPosition(engine, status.params.position);
      expect(opened.range.lowerBinId).toBeLessThanOrEqual(MOVED);
      expect(opened.range.upperBinId).toBeGreaterThanOrEqual(MOVED);
      const closed = await jsonRpc(engine.surfnet.rpcUrl, "getAccountInfo", [
        seeded.position,
        { encoding: "base64" },
      ]);
      expect(closed.value).toBeNull();
      time.advance();
      await engine.runDue();
      const later = await strategyStatus(engine, id);
      expect(later.lastTick.outcome).toBe("evaluated");
      expect(later.lastTick.state.outsideStreak).toBe(0);
      expect(later.lastTick.state.lastRecenterIntents).toEqual(
        status.lastTick.state.lastRecenterIntents,
      );
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});

/** @param {string} rpcUrl @param {string} owner @param {number} activeId */
const seedPair = async (rpcUrl, owner, activeId) => {
  const mintX = randomAddress();
  const mintY = randomAddress();
  const pair = await seedMeteoraPair(rpcUrl, { mintX, mintY, activeId, binStep: 10 });
  const position = await seedMeteoraPosition(rpcUrl, {
    lbPair: pair,
    owner,
    lowerBinId: -1,
    upperBinId: 1,
  });
  return { pair, position, mintX, mintY, activeId, binStep: 10 };
};

/** @param {string} pool @param {string} position */
const draft = (pool, position) => ({
  owner: "swarm",
  kind: "range",
  params: {
    protocol: "meteora",
    pool,
    position,
    width: WIDTH,
    recenterWhenOutsideFor: 2,
    maxRecentersPerDay: 4,
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

/**
 * @param {{ url: string; token: string; surfnet: { rpcUrl: string; wsUrl: string }; privateKey: string }} engine
 * @param {string} id
 */
const strategyStatus = async (engine, id) =>
  JSON.parse(
    (await runSolos(["strategy", "status", id], childEnv(engine), { features: ["STRATEGIES"] }))
      .stdout,
  );

/**
 * @param {{ url: string; token: string; surfnet: { rpcUrl: string; wsUrl: string }; privateKey: string }} engine
 * @param {string} position
 */
const readPosition = async (engine, position) =>
  JSON.parse(
    (
      await runSolos(
        ["liquidity", "position", "--protocol", "meteora", "--position", position],
        childEnv(engine),
      )
    ).stdout,
  );

/** @param {{ url: string; token: string; surfnet: { rpcUrl: string; wsUrl: string }; privateKey: string }} engine */
const childEnv = (engine) => ({
  SOLOS_ENGINE_URL: engine.url,
  SOLOS_ENGINE_TOKEN: engine.token,
  SOLOS_LOG_LEVEL: "warn",
  SOLOS_SIGNER_PRIVATE_KEY: engine.privateKey,
  SOLANA_RPC_URL: engine.surfnet.rpcUrl,
  SOLANA_WS_URL: engine.surfnet.wsUrl,
});
