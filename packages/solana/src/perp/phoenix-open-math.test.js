// @ts-check
import { expect, test } from "bun:test";
import { BuildRejected } from "@solos/core";
import { planOpenLots, protocolLeverageForLots } from "./phoenix-open-math.js";

const base = {
  notionalUsd: "30000000",
  limitPriceUsd: "150.255",
  maxLeverage: 2,
  side: /** @type {const} */ ("long"),
};
const market = { tickSize: 100n, baseLotDecimals: 2, protocolMaxLeverage: 25n };

test("IOC open rounds buy down and sell up without exceeding notional or skipping partial fills", () => {
  const facts = { input: base, market, equity: 20_000_000n, exposure: 0n, observedSlot: 100n };
  const long = planOpenLots(facts);
  const short = planOpenLots({ ...facts, input: { ...base, side: "short" } });
  expect(long).toMatchObject({
    priceInTicks: 15_025n,
    numBaseLots: 19n,
    numQuoteLots: 30_000_000n,
    lastValidSlot: 116n,
  });
  expect(short).toMatchObject({
    priceInTicks: 15_026n,
    numBaseLots: 19n,
    numQuoteLots: 30_000_000n,
  });
});

test("IOC open rejects a sell lot whose upward-rounded tick would exceed the notional cap", () => {
  expect(() =>
    planOpenLots({
      input: { ...base, side: "short", limitPriceUsd: "100.005", notionalUsd: "1000050" },
      market,
      equity: 20_000_000n,
      exposure: 0n,
      observedSlot: 100n,
    }),
  ).toThrow(BuildRejected);
});

test("IOC open selects the protocol leverage tier for its conservatively rounded size", () => {
  const tiers = [
    { upperBoundSize: 10n, maxLeverage: 25n },
    { upperBoundSize: 100n, maxLeverage: 3n },
  ];
  expect(protocolLeverageForLots(tiers, 19n)).toBe(3n);
});

test("IOC open refuses leverage shortfall with a minimum-needed and shortfall in quote lots", () => {
  let error;
  try {
    planOpenLots({
      input: { ...base, maxLeverage: 1 },
      market,
      equity: 20_000_000n,
      exposure: 0n,
      observedSlot: 100n,
    });
  } catch (error_) {
    error = error_;
  }
  expect(error).toBeInstanceOf(BuildRejected);
  expect(/** @type {BuildRejected} */ (error).reason).toContain("minimum needed 30000000");
  try {
    planOpenLots({ input: base, market, equity: 0n, exposure: 0n, observedSlot: 100n });
  } catch (error_) {
    error = error_;
  }
  expect(/** @type {BuildRejected} */ (error).reason).toContain("minimum needed 15000000");
});
