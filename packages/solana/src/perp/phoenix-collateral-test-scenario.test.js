// @ts-check
/**
 * The scenario fixture's own freshness contract. `assertFreshSnapshot` rejects a risk snapshot
 * more than 12 slots behind the chain, so a fixture that pins one slot at setup goes stale while
 * a slow runner seeds accounts and builds — the guard fires instead of the behaviour under test,
 * and the perp close suite flaked on unrelated pull requests (#111).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { jsonRpc } from "../surfnet/index.js";
import { ensureOfflineSurfnet, randomSeed } from "../surfnet/test-surfnet.js";
import { TRADER_STATE_PATH } from "./phoenix-api.js";
import { startCollateralScenario } from "./phoenix-collateral-test-scenario.js";

/** The window `assertFreshSnapshot` enforces, in slots. */
const FRESH_WINDOW = 12n;
/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** @param {string} url @param {string} authority */
const snapshotSlot = async (url, authority) => {
  const response = await fetch(`${url}${TRADER_STATE_PATH}/${authority}?traderPdaIndex=0`);
  const body = /** @type {{ slot: string }} */ (await response.json());
  return BigInt(body.slot);
};

describe("collateral scenario fixture [integration]", () => {
  test("the risk snapshot stays inside the freshness window as the chain advances", async () => {
    const surfnet = await ensureOfflineSurfnet();
    const scenario = await startCollateralScenario(surfnet.rpcUrl, randomSeed(), {
      collateral: 30_000_000n,
    });
    stops.push(scenario.fixture.stop);

    const first = await snapshotSlot(scenario.fixture.url, scenario.owner);
    // Longer than the window is worth in wall clock, which is what a slow runner costs.
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const later = await snapshotSlot(scenario.fixture.url, scenario.owner);
    const chain = BigInt(await jsonRpc(surfnet.rpcUrl, "getSlot", [{ commitment: "confirmed" }]));

    expect(later).toBeGreaterThanOrEqual(first);
    expect(chain - later).toBeLessThanOrEqual(FRESH_WINDOW);
  }, 30_000);

  test("staleRisk stays deterministically outside the window", async () => {
    const surfnet = await ensureOfflineSurfnet();
    const scenario = await startCollateralScenario(surfnet.rpcUrl, randomSeed(), {
      collateral: 30_000_000n,
      staleRisk: true,
    });
    stops.push(scenario.fixture.stop);

    const snapshot = await snapshotSlot(scenario.fixture.url, scenario.owner);
    const chain = BigInt(await jsonRpc(surfnet.rpcUrl, "getSlot", [{ commitment: "confirmed" }]));
    expect(chain - snapshot).toBeGreaterThan(FRESH_WINDOW);
  }, 30_000);
});
