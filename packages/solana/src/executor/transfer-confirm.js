// @ts-check
import { TransactionFailed } from "@solos/core";
import { Effect } from "effect";

const CONFIRM_DEADLINE_MS = 75_000;
const CONFIRM_POLL_MS = 400;
const MAY_HAVE_LANDED =
  "confirmation was not established before the deadline; the transaction may still have landed";

/**
 * @typedef {{
 *   readonly signature: string;
 *   readonly submit: (abortSignal: AbortSignal) => Promise<void>;
 *   readonly lookup: () => Promise<boolean>;
 *   readonly deadlineMs?: number;
 *   readonly pollMs?: number;
 * }} ConfirmSubmitted
 */

/** @param {unknown} status */
export const isConfirmedLanded = (status) => {
  if (status === null || typeof status !== "object") return false;
  const row = /** @type {{ confirmationStatus?: unknown; err?: unknown }} */ (status);
  if (row.confirmationStatus !== "confirmed" && row.confirmationStatus !== "finalized") {
    return false;
  }
  return row.err === null || row.err === undefined;
};

/** @param {ConfirmSubmitted} deps */
export const confirmSubmitted = (deps) =>
  Effect.tryPromise({
    try: () => runConfirm(deps),
    catch: () => new TransactionFailed({ signature: deps.signature, reason: MAY_HAVE_LANDED }),
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

/**
 * @param {() => Promise<boolean>} lookup
 * @param {AbortSignal} abort
 * @param {number} pollMs
 */
const pollUntilLanded = async (lookup, abort, pollMs) => {
  for (;;) {
    if (await lookup()) return;
    if (abort.aborted) throw abort.reason ?? new Error("aborted");
    await sleep(pollMs, abort);
  }
};

/**
 * @param {ConfirmSubmitted["submit"]} submit
 * @param {ConfirmSubmitted["lookup"]} lookup
 * @param {AbortSignal} abort
 */
const submitOrRecover = async (submit, lookup, abort) => {
  try {
    const submitted = submit(abort);
    const aborted = whenAborted(abort);
    submitted.catch(() => {});
    aborted.catch(() => {});
    await Promise.race([submitted, aborted]);
  } catch {
    if (await lookup()) return;
    throw new Error("submit failed");
  }
};

/** @param {ConfirmSubmitted} deps */
const runConfirm = async (deps) => {
  const pollMs = deps.pollMs ?? CONFIRM_POLL_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.deadlineMs ?? CONFIRM_DEADLINE_MS);
  try {
    await submitOrRecover(deps.submit, deps.lookup, controller.signal);
    await pollUntilLanded(deps.lookup, controller.signal, pollMs);
  } finally {
    clearTimeout(timer);
  }
};
