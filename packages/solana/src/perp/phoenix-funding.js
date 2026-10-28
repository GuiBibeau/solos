// @ts-check
import {
  PerpAuthFailed,
  PerpHttpError,
  PerpMarketUnknown,
  PerpNetworkError,
  PerpRateLimited,
  PerpResponseInvalid,
  PerpTimeout,
} from "@solos/core";
import { Effect } from "effect";
import {
  DEFAULT_TIMEOUT_MS,
  FUNDING_RATES_PATH,
  MARKET_PATH,
  isDeadlineAbort,
  phoenixGet,
} from "./phoenix-api.js";
import {
  FundingMarketSchema,
  FundingRatesSchema,
  toFundingSnapshot,
} from "./phoenix-funding-map.js";
import { parseJson } from "./phoenix-wire.js";

const PROVIDER_REMEDY =
  "retry when the Phoenix perps endpoint answers; PHOENIX_BASE_URL selects it";
const UNKNOWN_REMEDY = "pass a symbol the exchange lists, such as SOL or SOL-PERP";
const HOUR_SECONDS = 3600;
const MAX_POINTS = 10_000;

/** @typedef {import("./phoenix-api.js").PhoenixConfig} PhoenixConfig */

/** @param {number} status */
const providerStatus = (status) => {
  if (status === 401 || status === 403) {
    return new PerpAuthFailed({ status, remedy: PROVIDER_REMEDY });
  }
  if (status === 429) return new PerpRateLimited({ status, remedy: PROVIDER_REMEDY });
  if (status < 200 || status >= 300) {
    return new PerpHttpError({
      status,
      reason: `Phoenix perps answered with HTTP ${status}`,
      remedy: PROVIDER_REMEDY,
    });
  }
  return undefined;
};

/** @param {unknown} error @param {number} timeoutMs */
const transportError = (error, timeoutMs) =>
  isDeadlineAbort(error)
    ? new PerpTimeout({ timeoutMs, remedy: PROVIDER_REMEDY })
    : new PerpNetworkError({ reason: "Phoenix perps request failed", remedy: PROVIDER_REMEDY });

/**
 * @param {PhoenixConfig} config
 * @param {string} path
 * @param {Record<string, string>} query
 */
const fetchOutcome = (config, path, query) => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Effect.tryPromise({
    try: () => phoenixGet(config, path, query),
    catch: (error) => transportError(error, timeoutMs),
  });
};

/**
 * @template T
 * @param {import("./phoenix-api.js").PhoenixOutcome} outcome
 * @param {import("zod").ZodType<T>} schema
 * @param {string} reason
 */
const decode = (outcome, schema, reason) => {
  const failed = providerStatus(outcome.status);
  if (failed) return Effect.fail(failed);
  const parsed = schema.safeParse(parseJson(outcome.body));
  if (!parsed.success) {
    return Effect.fail(new PerpResponseInvalid({ status: outcome.status, reason }));
  }
  return Effect.succeed(parsed.data);
};

/** @param {PhoenixConfig} config @param {string} market */
const readMarket = (config, market) =>
  Effect.gen(function* () {
    const outcome = yield* fetchOutcome(config, `${MARKET_PATH}/${encodeURIComponent(market)}`, {});
    if (outcome.status === 404)
      return yield* new PerpMarketUnknown({ market, remedy: UNKNOWN_REMEDY });
    const parsed = yield* decode(
      outcome,
      FundingMarketSchema,
      "market metadata did not match the documented wire contract",
    );
    if (parsed.symbol !== market) {
      return yield* new PerpResponseInvalid({
        status: 200,
        reason: "market symbol did not match the requested market",
      });
    }
    return parsed;
  });

/**
 * @param {{
 *   config: PhoenixConfig;
 *   market: string;
 *   intervalSeconds: number;
 *   lookbackHours: number;
 *   nowMs: number;
 * }} input
 */
const readRates = (input) =>
  Effect.gen(function* () {
    const windowMs = input.lookbackHours * HOUR_SECONDS * 1000;
    const limit = Math.min(
      MAX_POINTS,
      Math.ceil((input.lookbackHours * HOUR_SECONDS) / input.intervalSeconds) + 2,
    );
    const outcome = yield* fetchOutcome(
      input.config,
      `${FUNDING_RATES_PATH}/${encodeURIComponent(input.market)}/rates`,
      {
        startTime: String(input.nowMs - windowMs),
        endTime: String(input.nowMs),
        limit: String(limit),
      },
    );
    if (outcome.status === 404)
      return FundingRatesSchema.parse({ symbol: input.market, rates: [] });
    const parsed = yield* decode(
      outcome,
      FundingRatesSchema,
      "funding history did not match the documented wire contract",
    );
    if (parsed.symbol !== input.market) {
      return yield* new PerpResponseInvalid({
        status: 200,
        reason: "funding history symbol did not match the requested market",
      });
    }
    return parsed;
  });

/**
 * Market view first (unknown symbol before the rates call), then the public rates route.
 * @param {PhoenixConfig} config
 * @param {import("@solos/core").GetFundingRequest} request
 */
export const getFundingFlow = (config, request) =>
  Effect.gen(function* () {
    const nowMs = Date.now();
    const market = yield* readMarket(config, request.market);
    const rates = yield* readRates({
      config,
      market: request.market,
      intervalSeconds: market.fundingIntervalSeconds,
      lookbackHours: request.lookbackHours,
      nowMs,
    });
    return yield* Effect.try({
      try: () =>
        toFundingSnapshot({
          wireSymbol: request.market,
          intervalSeconds: market.fundingIntervalSeconds,
          intervalStart: market.statsSnapshot?.fundingStartIntervalTimestamp,
          rates: rates.rates,
          currentRate: rates.fundingRatePercentage,
          currentAt: rates.timestamp,
          nowMs,
          lookbackHours: request.lookbackHours,
        }),
      catch: (error) => /** @type {import("@solos/core").PerpError} */ (error),
    });
  });
