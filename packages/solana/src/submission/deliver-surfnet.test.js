// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { EventBusInMemory, sendSol, TransactionFailed } from "@solos/core";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { transferDraft } from "../executor/transfer-sol.js";
import { SolanaTestLive } from "../index.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSigner } from "../signer/kit-signer.js";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import {
  confirmationState,
  confirmDelivery,
  EXECUTION_FAILED,
  MAY_HAVE_LANDED,
} from "./confirm.js";
import { SLOW } from "./mode.js";
import { sealDraft } from "./seal-draft.js";
import { rpcSubmitter } from "./submitter.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("./sealed.js").Sealed} Sealed */

/**
 * Deliver through the RPC Submitter over a possibly overlaid RPC, with the default confirmation.
 * @param {Rpc} ctx @param {Sealed} sealed @param {number} [deadlineMs]
 */
const deliver = (ctx, sealed, deadlineMs = SLOW.confirmation.deadlineMs) =>
  confirmDelivery(rpcSubmitter(ctx), sealed, { ...SLOW.confirmation, deadlineMs });

/**
 * @template E
 * @param {import("effect").Effect.Effect<unknown, E, never>} effect
 */
const failureOf = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};

/**
 * @param {Rpc} ctx
 * @param {(opts?: { abortSignal?: AbortSignal }) => Promise<unknown>} send
 */
const overlayStatuses = (ctx, send) => ({
  ...ctx,
  rpc: new Proxy(ctx.rpc, {
    get(target, prop, receiver) {
      if (prop === "getSignatureStatuses") return () => ({ send });
      return Reflect.get(target, prop, receiver);
    },
  }),
});

/** @param {{ abortSignal?: AbortSignal } | undefined} opts */
const hangUntilAbort = (opts) =>
  new Promise((_, reject) => {
    const abort = opts?.abortSignal;
    if (!abort) return;
    const fail = () => reject(abort.reason ?? new Error("aborted"));
    if (abort.aborted) fail();
    else abort.addEventListener("abort", fail, { once: true });
  });

/** @param {Rpc} ctx @param {import("@solana/kit").Signature} signature */
const waitUntilLanded = async (ctx, signature) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { value } = await ctx.rpc
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .send();
    if (confirmationState(value[0]) === "success") return;
    await Bun.sleep(20);
  }
  throw new Error("Surfnet did not confirm the sent signature");
};

/** @param {Rpc} ctx @param {import("@solana/kit").Signature} signature */
const dropAfterSend = (ctx, signature) => ({
  ...ctx,
  rpc: new Proxy(ctx.rpc, {
    get(target, prop, receiver) {
      if (prop !== "sendTransaction") return Reflect.get(target, prop, receiver);
      const sendTx = Reflect.get(target, prop, receiver);
      return (/** @type {never} */ wire, /** @type {never} */ options) => ({
        send: async (/** @type {{ abortSignal?: AbortSignal }} */ opts) => {
          await sendTx(wire, options).send(opts);
          await waitUntilLanded(ctx, signature);
          throw new Error("transport dropped after send");
        },
      });
    },
  }),
});

/** Seal one real transfer draft on Surfnet, so each case delivers bytes it did not build.
 * @param {string} to */
const sealedPair = (to) =>
  Effect.gen(function* () {
    const ctx = yield* SolanaRpc;
    const kit = yield* KitSigner;
    const draft = transferDraft(kit, { type: "transfer_sol", to, lamports: "1000000" });
    const sealed = yield* sealDraft({ ctx, kit, mode: SLOW }, draft);
    return { ctx, sealed };
  });

describe("Submission delivery through the RPC Submitter against Surfnet [integration]", () => {
  /** @type {Layer.Layer<any>} */
  let layer;
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
  let surfnet;
  /** @type {string} */
  let recipient;

  beforeAll(async () => {
    surfnet = await ensureSurfnet();
    recipient = await seedAddress(randomSeed());
    layer = Layer.merge(SolanaTestLive({ ...surfnet, seed: randomSeed() }), EventBusInMemory);
    const sender = await Effect.runPromise(
      Effect.map(KitSigner, (k) => k.signer.address).pipe(Effect.provide(layer)),
    );
    await surfnet.cheats.fundSol(sender, 1);
  });

  /** @param {import("effect").Effect.Effect<any, any, any>} program */
  const provide = (program) => program.pipe(Effect.provide(layer));

  test("a real send is confirmed on Surfnet as success, never silence", async () => {
    const receipt = await Effect.runPromise(
      sendSol({ to: recipient, amountSol: "0.001", skipSimulation: false }).pipe(provide),
    );
    expect(receipt.signature.length).toBeGreaterThan(60);
    const status = await jsonRpc(surfnet.rpcUrl, "getSignatureStatuses", [
      [receipt.signature],
      { searchTransactionHistory: true },
    ]);
    expect(confirmationState(status.value[0])).toBe("success");
  });

  test("a dropped send still reports the signature when Surfnet already has it", async () => {
    const { ctx, sealed } = await Effect.runPromise(sealedPair(recipient).pipe(provide));
    const exit = await Effect.runPromiseExit(deliver(dropAfterSend(ctx, sealed.signature), sealed));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
    expect(exit.value.length).toBeGreaterThan(60);
  });

  test("a hung getSignatureStatuses lookup aborts at the confirmation deadline", async () => {
    const { ctx, sealed } = await Effect.runPromise(sealedPair(recipient).pipe(provide));
    let didReceiveAbort = false;
    const hung = overlayStatuses(ctx, (opts) => {
      didReceiveAbort ||= Boolean(opts?.abortSignal);
      return hangUntilAbort(opts);
    });
    const started = Date.now();
    const error = await failureOf(deliver(hung, sealed, 80));
    expect(Date.now() - started).toBeLessThan(5000);
    expect(didReceiveAbort).toBe(true);
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error)?.reason).toBe(MAY_HAVE_LANDED);
    expect(/** @type {TransactionFailed} */ (error)?.signature).toBeTruthy();
  });

  test("a confirmed execution error is TransactionFailed immediately, not may-have-landed", async () => {
    const { ctx, sealed } = await Effect.runPromise(sealedPair(recipient).pipe(provide));
    const failed = overlayStatuses(ctx, async () => ({
      context: { slot: 1n },
      value: [
        {
          slot: 1n,
          confirmations: 0,
          err: { InstructionError: [0, "Custom"] },
          confirmationStatus: "confirmed",
        },
      ],
    }));
    const started = Date.now();
    const error = await failureOf(deliver(failed, sealed, 5000));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error)?.reason).toBe(EXECUTION_FAILED);
    expect(/** @type {TransactionFailed} */ (error)?.signature).toBeTruthy();
  });
});
