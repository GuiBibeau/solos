// @ts-check
import { expect } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase64Codec, getU64Codec } from "@solana/kit";
import { ActionExecutor, BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT } from "../swap/jupiter-swap-build-bodies.js";
import {
  buildEnvelope,
  executorLayer,
  failureOf,
  stubBuildLayer,
} from "../swap/jupiter-swap-build-fixture.js";

/**
 * Offline driver for the executor's swap branch tests: the real DirectSignerExecutor over a
 * dead RPC port and a stub build Layer serving the documented envelope for the branch's own
 * taker. A BuildRejected proves refusal before any chain contact (the dead port would surface
 * as RpcError); an RpcError proves validation and signing passed and the first contact is the
 * lifetime gate or the simulation — never a send.
 */

/** @typedef {Awaited<ReturnType<typeof buildEnvelope>>} Envelope */

/** @type {import("@solos/actions").SwapAction} */
export const swapAction = {
  type: "swap",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  maxSlippageBps: 50,
};

export const attackerAddress = async () =>
  (await createMemorySignerFromBytes(randomSeed())).address;

/** Assert the effect failed with BuildRejected and return its fixed reason. */
/** @param {unknown} error */
export const reasonOf = (error) => {
  expect(error).toBeInstanceOf(BuildRejected);
  return /** @type {BuildRejected} */ (error).reason;
};

/** @param {number} index @param {{ pubkey: string; isSigner?: boolean }} patch @returns {(envelope: Envelope) => Envelope} */
export const rebindCreate = (index, patch) => (envelope) => {
  const [create, funding] = envelope.setupInstructions;
  if (!create || !funding) throw new Error("fixture envelope has no setup instructions");
  return {
    ...envelope,
    setupInstructions: [
      {
        ...create,
        accounts: create.accounts.map((a, p) => (p === index ? { ...a, ...patch } : a)),
      },
      funding,
    ],
  };
};

/** @param {number} index @param {{ pubkey: string; isSigner?: boolean }} patch @returns {(envelope: Envelope) => Envelope} */
export const rebindCleanup = (index, patch) => (envelope) => {
  const cleanup = envelope.cleanupInstruction;
  if (!cleanup) throw new Error("fixture envelope has no cleanup instruction");
  return {
    ...envelope,
    cleanupInstruction: {
      ...cleanup,
      accounts: cleanup.accounts.map((a, p) => (p === index ? { ...a, ...patch } : a)),
    },
  };
};

/** Replace the wSOL funding transfer's wire bytes with an arbitrary payload. */
/** @param {number[]} bytes @returns {(envelope: Envelope) => Envelope} */
export const withWrapForm = (bytes) => (envelope) => {
  const [create, transfer] = envelope.setupInstructions;
  if (!create || !transfer) throw new Error("fixture envelope has no setup instructions");
  return {
    ...envelope,
    setupInstructions: [
      create,
      { ...transfer, data: getBase64Codec().decode(Uint8Array.from(bytes)) },
    ],
  };
};

/** Replace the swap payload's wire bytes with an arbitrary payload. */
/** @param {number[]} bytes @returns {(envelope: Envelope) => Envelope} */
export const withSwapData = (bytes) => (envelope) => ({
  ...envelope,
  swapInstruction: {
    ...envelope.swapInstruction,
    data: getBase64Codec().decode(Uint8Array.from(bytes)),
  },
});

/** The canonical 12-byte System transfer carrying `lamports` instead of the requested amount. */
/** @param {bigint} lamports */
export const withWrapAmount = (lamports) =>
  withWrapForm([2, 0, 0, 0, ...getU64Codec().encode(lamports)]);

/**
 * Run one executor call and return its tagged failure with the recorded stub requests.
 * @param {"execute" | "simulate"} face
 * @param {(envelope: Envelope) => Envelope} [mutate]
 * @param {Partial<import("@solos/actions").SwapAction>} [actionOverrides]
 */
export const runBranch = async (face, mutate, actionOverrides = {}) => {
  /** @type {import("../swap/jupiter-swap-build-api.js").SwapBuildParams[]} */
  const requests = [];
  const layer = executorLayer(
    randomSeed(),
    stubBuildLayer(async (params) => {
      const envelope = await buildEnvelope({ taker: params.taker });
      return mutate ? mutate(envelope) : envelope;
    }, requests),
  );
  const error = await failureOf(
    Effect.gen(function* () {
      const executor = yield* ActionExecutor;
      if (face === "simulate") {
        return yield* executor.simulate({ ...swapAction, ...actionOverrides });
      }
      return yield* executor.execute(
        { ...swapAction, ...actionOverrides },
        { skipSimulation: true },
      );
    }).pipe(Effect.provide(layer)),
  );
  return { error, requests };
};
