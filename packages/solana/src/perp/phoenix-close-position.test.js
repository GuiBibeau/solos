// @ts-check
import { expect, test } from "bun:test";
import { ensureOfflineSurfnet, randomSeed } from "../surfnet/index.js";
import { seedClosePosition } from "./phoenix-close-test-position.js";
import { startCollateralScenario } from "./phoenix-collateral-test-scenario.js";

test("Phoenix close [integration] seeds signed long and short positions in real decoded Trader accounts", async () => {
  const surfnet = await ensureOfflineSurfnet();
  for (const lots of [100n, -100n]) {
    const scenario = await startCollateralScenario(surfnet.rpcUrl, randomSeed(), {
      collateral: 30_000_000n,
    });
    try {
      const state = await seedClosePosition(surfnet.rpcUrl, scenario.trader, lots);
      expect(state.positions.entries[0]?.key).toBe(0n);
      expect(state.positions.entries[0]?.value.baseLotPosition).toBe(lots);
      expect(state.state.quoteLotCollateral).toBe(30_000_000n);
    } finally {
      scenario.fixture.stop();
    }
  }
}, 20_000);
