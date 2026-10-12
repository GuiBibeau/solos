// @ts-check
import {
  CapLedger,
  PriceUnavailable,
  ValidationError,
  compareDecimal,
  getPrice,
} from "@solos/core";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";
import { transferNotionalUsd } from "./sol-notional.js";

/** @typedef {import("@solos-sh/actions").Action} Action */

/**
 * @param {{ strategyId?: string; tickId?: string }} body
 * @returns {ValidationError | undefined}
 */
export const strategyInputError = (body) => {
  if ((body.strategyId === undefined) === (body.tickId === undefined)) return undefined;
  return new ValidationError({
    field: "strategyId",
    value: null,
    reason: "strategyId and tickId are set together",
    remedy: "send both strategyId and tickId, or neither",
  });
};

/**
 * Reserve the Action's SOL notional before anything is signed. No strategy means no reserve.
 * @param {import("./http.js").EngineDeps} deps
 * @param {{ action: Action; strategyId?: string; tickId?: string }} body
 * @param {string} intentId
 * @returns {Promise<{ ok: true } | { ok: false; error: unknown }>}
 */
export const reserveExecute = async (deps, body, intentId) => {
  if (body.strategyId === undefined || body.tickId === undefined) return { ok: true };
  if (deps.caps !== true) return { ok: false, error: capsOff() };
  try {
    await deps.runtime.runPromise(hold(body, intentId));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

const capsOff = () =>
  new ValidationError({
    field: "strategyId",
    value: null,
    reason: "this engine is not serving Strategy caps",
    remedy: "start an engine that mounts the strategy registry",
  });

/**
 * @param {{ action: Action; strategyId?: string; tickId?: string }} body
 * @param {string} intentId
 */
const hold = (body, intentId) =>
  Effect.gen(function* () {
    const notionalUsd = yield* transferNotional(body.action);
    const ledger = yield* CapLedger;
    const strategyId = body.strategyId ?? "";
    const tickId = body.tickId ?? "";
    return yield* ledger.reserve({
      strategyId,
      tickId,
      intentId,
      notionalUsd,
      mint: WSOL_MINT,
    });
  });

/**
 * Native SOL is priced through the wrapped SOL mint. The hold includes the fee reserve.
 * @param {Action} action
 */
const transferNotional = (action) =>
  Effect.gen(function* () {
    if (action.type !== "transfer_sol") return yield* unsupported(action.type);
    const price = yield* getPrice({ mint: WSOL_MINT });
    if (!isPositiveUsd(price.priceUsd)) return yield* missingPrice(price.source);
    const notionalUsd = transferNotionalUsd(action.lamports, price.priceUsd);
    if (notionalUsd === undefined) return yield* unsupported(action.type);
    return notionalUsd;
  });

/** @param {string} priceUsd */
const isPositiveUsd = (priceUsd) =>
  /^\d+(\.\d+)?$/.test(priceUsd) && compareDecimal(priceUsd, "0") > 0;

/** @param {string} source */
const missingPrice = (source) =>
  new PriceUnavailable({
    mint: WSOL_MINT,
    source,
    reason: "wrapped SOL price must be positive before a Strategy cap reserves",
    remedy: "retry when the price feed reports a positive SOL price",
  });

/** @param {string} type */
const unsupported = (type) =>
  new ValidationError({
    field: "action.type",
    value: type,
    reason: "only transfer_sol is reserved against a Strategy cap",
    remedy: "execute a SOL transfer under the Strategy, or omit strategyId",
  });
