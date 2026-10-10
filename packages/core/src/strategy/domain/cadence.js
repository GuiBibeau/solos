// @ts-check
import { formatDuration } from "@solos-sh/actions";
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { cronGapMs, nextCronAt, parseCron } from "./cron.js";

/**
 * The next due instant strictly after `now` for an interval, or the next UTC cron match at or
 * after `now`. Undefined when the tick source is not a clock.
 * @param {{ readonly tickSource: { readonly type: string; readonly every?: number; readonly cron?: string } }} strategy
 * @param {number} now
 */
export const nextInstant = (strategy, now) => {
  const source = strategy.tickSource;
  if (source.type !== "clock") return undefined;
  if (source.every !== undefined) return now + source.every;
  if (source.cron === undefined) return undefined;
  return nextCronAt(source.cron, now);
};

/**
 * Registration refusal when a clock is faster than the Engine floor. The reason names the
 * requested interval and the remedy names the floor.
 * @param {{ readonly type: string; readonly every?: number; readonly cron?: string }} source
 * @param {number} floorMs
 */
export const floorRefusal = (source, floorMs) => {
  if (source.type !== "clock") return undefined;
  const requested = requestedMs(source);
  if (requested === undefined) return invalidCron(source.cron ?? "");
  if (requested >= floorMs) return undefined;
  return belowFloor(requested, floorMs);
};

/** @param {{ readonly every?: number; readonly cron?: string }} source */
const requestedMs = (source) => {
  if (source.every !== undefined) return source.every;
  if (source.cron === undefined || parseCron(source.cron) === undefined) return undefined;
  return cronGapMs(source.cron);
};

/** @param {string} cron */
const invalidCron = (cron) =>
  new BoundsExceeded({
    bound: "minInterval",
    limit: cron,
    requested: cron,
    scope: "engine",
    reason: `cron ${cron} is not five UTC fields`,
    remedy: "use five cron fields in UTC, such as 0 * * * *",
  });

/** @param {number} requested @param {number} floorMs */
const belowFloor = (requested, floorMs) =>
  new BoundsExceeded({
    bound: "minInterval",
    limit: formatDuration(floorMs),
    requested: formatDuration(requested),
    scope: "engine",
    reason: `requested interval ${formatDuration(requested)} is below the engine floor`,
    remedy: `raise the interval to at least ${formatDuration(floorMs)}, the engine floor`,
  });
