// @ts-check
import { CapLedger, ValidationError, getPrice } from "@solos/core";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";
import { lamportsToUsd } from "./sol-notional.js";

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
    remedy: "start the engine with the STRATEGIES flag",
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

/** Native SOL is priced through the wrapped SOL mint. @param {Action} action */
const transferNotional = (action) =>
  Effect.gen(function* () {
    if (action.type !== "transfer_sol") return yield* unsupported(action.type);
    const price = yield* getPrice({ mint: WSOL_MINT });
    const notionalUsd = lamportsToUsd(action.lamports, price.priceUsd);
    if (notionalUsd === undefined) return yield* unsupported(action.type);
    return notionalUsd;
  });

/** @param {string} type */
const unsupported = (type) =>
  new ValidationError({
    field: "action.type",
    value: type,
    reason: "only transfer_sol is reserved against a Strategy cap",
    remedy: "execute a SOL transfer under the Strategy, or omit strategyId",
  });
