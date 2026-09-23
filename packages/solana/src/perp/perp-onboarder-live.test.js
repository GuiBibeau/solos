// @ts-check
import { afterEach, expect, test } from "bun:test";
import { PerpOnboarder } from "@solos/core";
import { Effect } from "effect";
import { PerpOnboarderLive } from "./perp-onboarder-live.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";

/** @type {ReturnType<typeof startPhoenixFixture> | undefined} */
let fixture;
afterEach(() => fixture?.stop());

const owner = "11111111111111111111111111111111";

test("Phoenix onboarding status [integration] distinguishes absent and active accounts", async () => {
  fixture = startPhoenixFixture({ traderStatus: 404 });
  const read = (baseUrl) =>
    Effect.flatMap(PerpOnboarder, (port) => port.status(owner)).pipe(
      Effect.provide(PerpOnboarderLive({ baseUrl })),
    );
  expect(await Effect.runPromise(read(fixture.url))).toEqual({
    state: "unregistered",
    trader: null,
  });
  expect(fixture.requests[0]?.query).toEqual({ traderPdaIndex: "0" });
  fixture.stop();
  fixture = startPhoenixFixture({
    trader: {
      authority: owner,
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
    },
  });
  expect((await Effect.runPromise(read(fixture.url))).state).toBe("ready");
  fixture.stop();
  fixture = startPhoenixFixture({
    trader: {
      authority: owner,
      traderPdaIndex: 0,
      snapshot: {
        capabilities: {
          state: "cold",
          capabilities: {
            placeMarketOrder: { immediate: true },
            riskIncreasingTrade: { immediate: true },
            depositCollateral: { immediate: true },
          },
        },
        subaccounts: [{ subaccountIndex: 0, collateral: "0" }],
      },
    },
  });
  expect((await Effect.runPromise(read(fixture.url))).state).toBe("ready");
});

test("Phoenix onboarding status [integration] keeps cold and mismatched traders out of ready", async () => {
  const snapshot = {
    capabilities: {
      state: "cold",
      capabilities: {
        placeMarketOrder: { immediate: false },
        riskIncreasingTrade: { immediate: false },
        depositCollateral: { immediate: true },
      },
    },
    subaccounts: [{ subaccountIndex: 0, collateral: "0" }],
  };
  fixture = startPhoenixFixture({ trader: { authority: owner, traderPdaIndex: 0, snapshot } });
  const read = (url) =>
    Effect.flatMap(PerpOnboarder, (port) => port.status(owner)).pipe(
      Effect.provide(PerpOnboarderLive({ baseUrl: url })),
    );
  expect((await Effect.runPromise(read(fixture.url))).missing).toEqual([
    "trader.placeMarketOrder",
    "trader.riskIncreasingTrade",
  ]);
  fixture.stop();
  const rootReadyChildCold = {
    ...snapshot,
    capabilities: {
      state: "active",
      capabilities: {
        placeMarketOrder: { immediate: true },
        riskIncreasingTrade: { immediate: true },
        depositCollateral: { immediate: true },
      },
    },
    subaccounts: [{ subaccountIndex: 0, capabilities: snapshot.capabilities }],
  };
  fixture = startPhoenixFixture({
    trader: { authority: owner, traderPdaIndex: 0, snapshot: rootReadyChildCold },
  });
  expect((await Effect.runPromise(read(fixture.url))).missing).toEqual([
    "subaccount0.placeMarketOrder",
    "subaccount0.riskIncreasingTrade",
  ]);
  fixture.stop();
  const frozen = {
    ...rootReadyChildCold,
    capabilities: { ...rootReadyChildCold.capabilities, state: "frozen" },
    subaccounts: [{ subaccountIndex: 0 }],
  };
  fixture = startPhoenixFixture({
    trader: { authority: owner, traderPdaIndex: 0, snapshot: frozen },
  });
  expect((await Effect.runPromise(read(fixture.url))).missing).toEqual(["trader.state.frozen"]);
  fixture.stop();
  fixture = startPhoenixFixture({
    trader: { authority: "WrongOwner", traderPdaIndex: 0, snapshot },
  });
  const exit = await Effect.runPromiseExit(read(fixture.url));
  expect(JSON.stringify(exit)).toContain("PerpAccountCorrupt");
});
