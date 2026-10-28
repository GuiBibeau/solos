// @ts-check
import { Layer } from "effect";
import { cronGapMs, parseCron } from "../domain/cron.js";
import { ObservationStaleness } from "../ports/observation-staleness.js";

const DEFAULT_INTERVALS = 2;
const FALLBACK_MS = 60_000;

/**
 * @param {{ readonly intervals?: number; readonly absoluteMs?: number }} [options]
 */
export const observationStaleness = (options = {}) =>
  Layer.sync(ObservationStaleness, () => ({
    limitMs: (strategy) => limitMs(strategy, options),
  }));

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{ readonly intervals?: number; readonly absoluteMs?: number }} options
 */
const limitMs = (strategy, options) => {
  if (options.absoluteMs !== undefined) return options.absoluteMs;
  const intervals = options.intervals ?? DEFAULT_INTERVALS;
  return intervals * (intervalOf(strategy) ?? FALLBACK_MS);
};

/**
 * A rebalance quote is stale when `priceAt` or any `priceAt:<mint>` is older than the limit.
 * `priceAt` is the oldest of those mint timestamps, so one field is enough.
 * @param {Readonly<Record<string, string | number>>} observations
 * @returns {{ readonly reason: string; readonly remedy: string } | undefined}
 */
export const quoteIsStale = (observations) => {
  if (typeof observations.stalenessMs !== "number") return undefined;
  const stamps = priceStamps(observations);
  const now = observations.instant;
  if (typeof now !== "number" || stamps.length === 0) return missingStamp();
  const oldest = Math.min(...stamps);
  if (now - oldest <= observations.stalenessMs) return undefined;
  return {
    reason: "price is older than the staleness limit",
    remedy: "retry when the price feed returns a newer quote",
  };
};

/** @param {Readonly<Record<string, string | number>>} observations */
const priceStamps = (observations) => {
  /** @type {number[]} */
  const stamps = [];
  for (const [key, value] of Object.entries(observations)) {
    if (typeof value === "number" && (key === "priceAt" || key.startsWith("priceAt:"))) {
      stamps.push(value);
    }
  }
  return stamps;
};

const missingStamp = () => ({
  reason: "price observation has no timestamp",
  remedy: "retry when the price feed returns a timestamped quote",
});

/** @param {import("@solos-sh/actions").Strategy} strategy */
const intervalOf = (strategy) => {
  const source = strategy.tickSource;
  if (source.type !== "clock") return undefined;
  if (source.every !== undefined) return source.every;
  if (source.cron !== undefined && parseCron(source.cron) !== undefined)
    return cronGapMs(source.cron);
  return undefined;
};
