// @ts-check

/** @param {string} key @param {unknown} value */
const whenSet = (key, value) => (value === undefined ? {} : { [key]: value });

/**
 * Strategy layer options for one engine process.
 * @param {{
 *   readonly allowedMints?: ReadonlyArray<string>;
 *   readonly minIntervalMs: number;
 *   readonly tickWindow: number;
 *   readonly mode: string;
 *   readonly now?: () => number;
 *   readonly observations?: () => Readonly<Record<string, string | number>>;
 *   readonly quote?: import("./strategy-layer.js").StrategyLayerOptions["quote"];
 *   readonly stalenessIntervals?: number;
 *   readonly stalenessMs?: number;
 *   readonly swapFixture?: import("./swap-fixture.js").SwapFixtureConfig;
 *   readonly settleAction?: import("./tick-settle.js").SettleAction;
 * }} input
 */
export const layerOptions = (input) => ({
  allowedMints: input.allowedMints ?? [],
  minIntervalMs: input.minIntervalMs,
  tickWindow: input.tickWindow,
  dry: input.mode === "dry",
  now: input.now ?? (() => Date.now()),
  ...whenSet("observations", input.observations),
  ...whenSet("quote", input.quote),
  ...whenSet("stalenessIntervals", input.stalenessIntervals),
  ...whenSet("stalenessMs", input.stalenessMs),
  ...whenSet("swapFixture", input.swapFixture),
  ...whenSet("settleAction", input.settleAction),
});
