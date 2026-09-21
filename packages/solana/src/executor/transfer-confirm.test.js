// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { confirmSubmitted, isConfirmedLanded } from "./transfer-confirm.js";

const SIGNATURE = "5".repeat(88);
const MAY_HAVE_LANDED =
  "confirmation was not established before the deadline; the transaction may still have landed";

/** @param {AbortSignal} abort */
const hangUntilAbort = (abort) =>
  new Promise((_, reject) => {
    const fail = () => reject(abort.reason ?? new Error("aborted"));
    if (abort.aborted) fail();
    else abort.addEventListener("abort", fail, { once: true });
  });

/**
 * @param {{
 *   submit?: (abortSignal: AbortSignal) => Promise<void>;
 *   lookup: () => Promise<boolean>;
 *   deadlineMs?: number;
 *   pollMs?: number;
 * }} deps
 */
const run = (deps) =>
  Effect.runPromiseExit(
    confirmSubmitted({
      signature: SIGNATURE,
      submit: deps.submit ?? (async () => {}),
      lookup: deps.lookup,
      deadlineMs: deps.deadlineMs ?? 40,
      pollMs: deps.pollMs ?? 10,
    }),
  );

const causeText = (/** @type {Exit.Exit<unknown, unknown>} */ exit) =>
  Exit.isFailure(exit) ? JSON.stringify(exit) : "";

describe("confirmSubmitted", () => {
  test("a confirmed lookup after send is the signature, never silence", async () => {
    const exit = await run({ lookup: async () => true });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
    expect(exit.value).toBe(SIGNATURE);
  });

  test("a hang that later looks confirmed still reports the signature", async () => {
    const exit = await run({ submit: hangUntilAbort, lookup: async () => true });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
    expect(exit.value).toBe(SIGNATURE);
  });

  test("a send error that later looks confirmed still reports the signature", async () => {
    const exit = await run({
      submit: async () => {
        throw new Error("websocket dropped");
      },
      lookup: async () => true,
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
    expect(exit.value).toBe(SIGNATURE);
  });

  test("a hang that never looks confirmed is TransactionFailed with may-have-landed", async () => {
    const exit = await run({ submit: hangUntilAbort, lookup: async () => false });
    expect(causeText(exit)).toContain("TransactionFailed");
    expect(causeText(exit)).toContain(SIGNATURE);
    expect(causeText(exit)).toContain(MAY_HAVE_LANDED);
  });

  test("unknown status after the deadline is TransactionFailed with may-have-landed", async () => {
    const exit = await run({ lookup: async () => false });
    expect(causeText(exit)).toContain("TransactionFailed");
    expect(causeText(exit)).toContain(SIGNATURE);
    expect(causeText(exit)).toContain(MAY_HAVE_LANDED);
  });
});

describe("isConfirmedLanded", () => {
  test("only confirmed or finalized with a null err counts as landed", () => {
    expect(isConfirmedLanded(null)).toBe(false);
    expect(isConfirmedLanded({ confirmationStatus: "processed", err: null })).toBe(false);
    expect(isConfirmedLanded({ confirmationStatus: "confirmed", err: null })).toBe(true);
    expect(isConfirmedLanded({ confirmationStatus: "finalized", err: null })).toBe(true);
    expect(
      isConfirmedLanded({
        confirmationStatus: "confirmed",
        err: { InstructionError: [0, "Custom"] },
      }),
    ).toBe(false);
  });
});
