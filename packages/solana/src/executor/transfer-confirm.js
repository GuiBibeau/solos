// @ts-check
import { TransactionFailed } from "@solos/core";
import { Effect } from "effect";

const CONFIRM_DEADLINE_MS = 75_000;
const CONFIRM_POLL_MS = 400;
export const MAY_HAVE_LANDED =
  "confirmation was not established before the deadline; the transaction may still have landed";
export const EXECUTION_FAILED = "the transaction confirmed with an execution error";

/**
 * @typedef {"pending" | "success" | "failed"} ConfirmationState
 * @typedef {{
 *   readonly signature: string;
 *   readonly submit: (abortSignal: AbortSignal) => Promise<void>;
 *   readonly lookup: (abortSignal: AbortSignal) => Promise<ConfirmationState>;
 *   readonly deadlineMs?: number;
 *   readonly pollMs?: number;
 * }} ConfirmSubmitted
 */

/** @param {unknown} status @returns {ConfirmationState} */
export const confirmationState = (status) => {
  if (status === null || typeof status !== "object") return "pending";
  const row = /** @type {{ confirmationStatus?: unknown; err?: unknown }} */ (status);
  if (row.confirmationStatus !== "confirmed" && row.confirmationStatus !== "finalized") {
    return "pending";
  }
  return row.err === null || row.err === undefined ? "success" : "failed";
};

/** @param {unknown} status */
export const isConfirmedLanded = (status) => confirmationState(status) === "success";

/** @param {ConfirmSubmitted} deps */
export const confirmSubmitted = (deps) =>
  Effect.tryPromise({
    try: () => runConfirm(deps),
    catch: (error) =>
      error instanceof TransactionFailed
        ? error
        : new TransactionFailed({ signature: deps.signature, reason: MAY_HAVE_LANDED }),
  }).pipe(Effect.as(deps.signature));

/** @param {AbortSignal} abort */
const whenAborted = (abort) =>
  new Promise((_, reject) => {
    const fail = () => reject(abort.reason ?? new Error("aborted"));
    if (abort.aborted) fail();
    else abort.addEventListener("abort", fail, { once: true });
  });

/** @param {number} ms @param {AbortSignal} abort */
const sleep = (ms, abort) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const fail = () => {
      clearTimeout(timer);
      reject(abort.reason ?? new Error("aborted"));
    };
    if (abort.aborted) fail();
    else abort.addEventListener("abort", fail, { once: true });
  });

/** @param {ConfirmSubmitted} deps @param {AbortSignal} abort */
const lookupOk = async (deps, abort) => {
  const state = await deps.lookup(abort);
  if (state === "failed") {
    throw new TransactionFailed({ signature: deps.signature, reason: EXECUTION_FAILED });
  }
  return state === "success";
};

/**
 * @param {ConfirmSubmitted} deps
 * @param {AbortSignal} abort
 * @param {number} pollMs
 */
const pollUntilLanded = async (deps, abort, pollMs) => {
  for (;;) {
    if (await lookupOk(deps, abort)) return;
    if (abort.aborted) throw abort.reason ?? new Error("aborted");
    await sleep(pollMs, abort);
  }
};

/** @param {ConfirmSubmitted} deps @param {AbortSignal} abort */
const submitOrRecover = async (deps, abort) => {
  try {
    const submitted = deps.submit(abort);
    const aborted = whenAborted(abort);
    submitted.catch(() => undefined);
    aborted.catch(() => undefined);
    await Promise.race([submitted, aborted]);
  } catch (error) {
    if (error instanceof TransactionFailed) throw error;
    if (await lookupOk(deps, abort)) return;
    throw new Error("submit failed");
  }
};

/** @param {ConfirmSubmitted} deps */
const runConfirm = async (deps) => {
  const pollMs = deps.pollMs ?? CONFIRM_POLL_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.deadlineMs ?? CONFIRM_DEADLINE_MS);
  try {
    await submitOrRecover(deps, controller.signal);
    await pollUntilLanded(deps, controller.signal, pollMs);
  } finally {
    clearTimeout(timer);
  }
};
