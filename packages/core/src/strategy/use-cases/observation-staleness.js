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

/** @param {import("@solos-sh/actions").Strategy} strategy */
const intervalOf = (strategy) => {
  const source = strategy.tickSource;
  if (source.type !== "clock") return undefined;
  if (source.every !== undefined) return source.every;
  if (source.cron !== undefined && parseCron(source.cron) !== undefined)
    return cronGapMs(source.cron);
  return undefined;
};
