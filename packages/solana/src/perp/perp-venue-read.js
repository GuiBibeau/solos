// @ts-check
import { PerpNetworkError, PerpResponseInvalid, PerpTimeout } from "@solos/core";
import { Effect } from "effect";
import {
  DEFAULT_TIMEOUT_MS,
  MARKET_PATH,
  MARKETS_PATH,
  TRADER_PDA_INDEX,
  TRADER_STATE_PATH,
  isDeadlineAbort,
  phoenixGet,
} from "./phoenix-api.js";
import { marketStatusError, statusError } from "./phoenix-errors.js";
import { mapEnumeration, mapPointRead } from "./phoenix-map.js";
import {
  MarketConfigSchema,
  MarketsListSchema,
  TraderStateSchema,
  parseJson,
} from "./phoenix-wire.js";

/** @typedef {import("./phoenix-api.js").PhoenixConfig} PhoenixConfig */

/**
 * One documented endpoint: where to GET, the pinned query, its status mapping, the wire schema
 * and the fixed reason a 200 with the wrong shape carries.
 * @template T
 * @typedef {{
 *   readonly path: string;
 *   readonly query: Record<string, string>;
 *   readonly statusError: (status: number) => import("@solos/core").PerpError | undefined;
 *   readonly schema: import("zod").ZodType<T>;
 *   readonly reason: string;
 * }} JsonRequest
 */

/**
 * Translate one outcome: status errors first, then the wire schema. A non-matching 200 is a
 * response-contract failure with a fixed reason — the raw body never travels.
 * @template T
 * @param {import("./phoenix-api.js").PhoenixOutcome} outcome
 * @param {JsonRequest<T>} request
 */
const decode = (outcome, request) => {
  const failed = request.statusError(outcome.status);
  if (failed) return Effect.fail(failed);
  const parsed = request.schema.safeParse(parseJson(outcome.body));
  if (!parsed.success) {
    return Effect.fail(new PerpResponseInvalid({ status: outcome.status, reason: request.reason }));
  }
  return Effect.succeed(parsed.data);
};

/** @template T @param {PhoenixConfig} config @param {JsonRequest<T>} request */
const requestJson = (config, request) => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Effect.tryPromise({
    try: () => phoenixGet(config, request.path, request.query),
    catch: (error) =>
      isDeadlineAbort(error)
        ? new PerpTimeout({ timeoutMs })
        : new PerpNetworkError({ reason: "Phoenix perps request failed" }),
  }).pipe(Effect.flatMap((outcome) => decode(outcome, request)));
};

/**
 * Trader state at the contract scope: the index is sent explicitly, never defaulted silently.
 * @param {PhoenixConfig} config
 * @param {string} authority
 */
const traderState = (config, authority) =>
  requestJson(config, {
    path: `${TRADER_STATE_PATH}/${encodeURIComponent(authority)}`,
    query: { traderPdaIndex: String(TRADER_PDA_INDEX) },
    statusError,
    schema: TraderStateSchema,
    reason: "trader state did not match the documented wire contract",
  });

/** Wraps pure snapshot mapping so a typed PerpError becomes the effect's error channel.
 * @template T @param {() => T} map @returns {import("effect").Effect.Effect<T, import("@solos/core").PerpError>}
 */
const mapped = (map) =>
  Effect.try({
    try: map,
    catch: (error) => /** @type {import("@solos/core").PerpError} */ (error),
  });

/**
 * Market metadata first (so an unknown symbol is PerpMarketUnknown before any account work),
 * then the trader snapshot.
 * @param {PhoenixConfig} config
 * @param {import("@solos/core").GetPositionRequest} request
 */
export const getPositionFlow = (config, request) =>
  Effect.gen(function* () {
    const market = yield* requestJson(config, {
      path: `${MARKET_PATH}/${encodeURIComponent(request.market)}`,
      query: {},
      statusError: (status) => marketStatusError(status, request.market),
      schema: MarketConfigSchema,
      reason: "market metadata did not match the documented wire contract",
    });
    const state = yield* traderState(config, request.owner);
    return yield* mapped(() => mapPointRead({ authority: request.owner, market, state }));
  });

/**
 * Complete enumeration: one markets call, one trader-state call.
 * @param {PhoenixConfig} config
 * @param {string} owner
 */
export const listPositionsFlow = (config, owner) =>
  Effect.gen(function* () {
    const markets = yield* requestJson(config, {
      path: MARKETS_PATH,
      query: {},
      statusError,
      schema: MarketsListSchema,
      reason: "markets list did not match the documented wire contract",
    });
    const state = yield* traderState(config, owner);
    return yield* mapped(() => mapEnumeration({ authority: owner, markets, state }));
  });
