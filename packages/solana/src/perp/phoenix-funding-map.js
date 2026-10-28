// @ts-check
import {
  PerpResponseInvalid,
  PerpStateIncomplete,
  aprFundingPct,
  fundingMarketLabel,
  hourlyFundingPct,
} from "@solos/core";
import { z } from "zod";

const MAX_POINTS = 10_000;

export const FundingPointSchema = z.object({
  timestamp: z.union([z.number(), z.string()]),
  fundingRatePercentage: z.string(),
});

export const FundingRatesSchema = z.object({
  symbol: z.string().min(1),
  rates: z.array(FundingPointSchema).max(MAX_POINTS),
  fundingRatePercentage: z.string().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
});

export const FundingMarketSchema = z.object({
  symbol: z.string().min(1),
  fundingIntervalSeconds: z.number().int().positive(),
  statsSnapshot: z
    .object({
      fundingStartIntervalTimestamp: z.union([z.number().int(), z.string().min(1)]),
    })
    .nullish(),
});

const HOUR_MS = 3_600_000;
const SECONDS_CEILING = 10_000_000_000;
const NO_RATE = "Phoenix returned no funding rate for this market";
const BAD_TIME = "funding timestamp was not unix seconds or an ISO-8601 time";

/** @typedef {{ atMs: number; intervalPct: string }} FundingPoint */
/** @typedef {{ timestamp: number | string; fundingRatePercentage: string }} WirePoint */

/**
 * Unix seconds (live host) or an ISO-8601 string. Milliseconds are accepted above 1e10.
 * @param {number | string | null | undefined} value
 * @returns {number | undefined}
 */
export const fundingInstantMs = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < SECONDS_CEILING ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return fundingInstantMs(Number(value));
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** @param {number | string} value */
const requireInstant = (value) => {
  const ms = fundingInstantMs(value);
  if (ms === undefined) throw new PerpResponseInvalid({ status: 200, reason: BAD_TIME });
  return ms;
};

/** @param {WirePoint} point */
const toPoint = (point) => ({
  atMs: requireInstant(point.timestamp),
  intervalPct: point.fundingRatePercentage,
});

/** @param {readonly WirePoint[]} rates @param {number} startMs */
const inWindow = (rates, startMs) =>
  rates
    .map((point) => toPoint(point))
    .filter((point) => point.atMs >= startMs)
    .toSorted((left, right) => left.atMs - right.atMs);

/** @param {FundingPoint} point @param {number} intervalSeconds */
const historyPoint = (point, intervalSeconds) => ({
  at: new Date(point.atMs).toISOString(),
  rateHourlyPct: hourlyFundingPct(point.intervalPct, intervalSeconds),
});

/**
 * @param {number | string | null | undefined} start
 * @param {number} intervalSeconds
 */
const nextFundingAt = (start, intervalSeconds) => {
  if (start === null || start === undefined) return null;
  return new Date(requireInstant(start) + intervalSeconds * 1000).toISOString();
};

/**
 * @param {{
 *   wireSymbol: string;
 *   intervalSeconds: number;
 *   intervalStart: number | string | null | undefined;
 *   current: FundingPoint;
 *   history: ReadonlyArray<{ at: string; rateHourlyPct: string }>;
 * }} input
 */
const buildSnapshot = (input) => {
  const hourly = hourlyFundingPct(input.current.intervalPct, input.intervalSeconds);
  return {
    market: fundingMarketLabel(input.wireSymbol),
    at: new Date(input.current.atMs).toISOString(),
    rateHourlyPct: hourly,
    aprPct: aprFundingPct(hourly),
    nextFundingAt: nextFundingAt(input.intervalStart, input.intervalSeconds),
    history: input.history,
  };
};

/**
 * Newest in-window print is the current rate and every in-window print is history. An empty
 * series with `currentRate` is the current-only snapshot (`history: []`).
 * @param {{
 *   wireSymbol: string;
 *   intervalSeconds: number;
 *   intervalStart: number | string | null | undefined;
 *   rates: readonly WirePoint[];
 *   currentRate?: string;
 *   currentAt?: number | string;
 *   nowMs: number;
 *   lookbackHours: number;
 * }} wire
 */
export const toFundingSnapshot = (wire) => {
  const selected = inWindow(wire.rates, wire.nowMs - wire.lookbackHours * HOUR_MS);
  const latest = selected.at(-1);
  if (latest !== undefined) {
    return buildSnapshot({
      wireSymbol: wire.wireSymbol,
      intervalSeconds: wire.intervalSeconds,
      intervalStart: wire.intervalStart,
      current: latest,
      history: selected.map((point) => historyPoint(point, wire.intervalSeconds)),
    });
  }
  if (wire.currentRate === undefined || wire.currentAt === undefined) {
    throw new PerpStateIncomplete({ reason: NO_RATE });
  }
  return buildSnapshot({
    wireSymbol: wire.wireSymbol,
    intervalSeconds: wire.intervalSeconds,
    intervalStart: wire.intervalStart,
    current: { atMs: requireInstant(wire.currentAt), intervalPct: wire.currentRate },
    history: [],
  });
};
