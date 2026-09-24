// @ts-check
import { expect, test } from "bun:test";
import { NoPositionToClose } from "@solos/core";
import { planCloseLots } from "./phoenix-close-math.js";

const market = { tickSize: 100n, baseLotDecimals: 2 };
const plan = (positionLots) =>
  planCloseLots({
    positionLots,
    market,
    limitPriceUsd: "120.005",
    observedSlot: 100n,
    symbol: "SOL",
  });

test("reduce-only close derives opposite side, conservative ticks and never sizes beyond signed exposure", () => {
  expect(plan(100n)).toEqual({
    side: "short",
    priceInTicks: 12_001n,
    numBaseLots: 100n,
    numQuoteLots: null,
    lastValidSlot: 116n,
  });
  expect(plan(-100n)).toEqual({
    side: "long",
    priceInTicks: 12_000n,
    numBaseLots: 100n,
    numQuoteLots: null,
    lastValidSlot: 116n,
  });
});

test("flat Phoenix close fails with tagged NoPositionToClose, not a fake signature", () => {
  expect(() => plan(0n)).toThrow(NoPositionToClose);
});
