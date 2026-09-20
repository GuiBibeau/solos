// @ts-check
import { expect } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase64Codec, getU64Codec } from "@solana/kit";
import { ActionExecutor, BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT } from "../swap/jupiter-swap-build-bodies.js";
import { buildEnvelope, executorLayer, failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { startBuildFixture } from "../swap/jupiter-swap-build-http-fixture.js";
import { JupiterSwapBuildLive } from "../swap/jupiter-swap-build-live.js";

/**
 * Integration driver for the executor's swap branch tests: the real DirectSignerExecutor and
 * Jupiter HTTP adapter over a loopback build fixture. The RPC adapter targets a closed loopback
 * port, so validation failures remain distinguishable from the first read-only RPC preflight.
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
  const [create, ...rest] = envelope.setupInstructions;
  if (!create) throw new Error("fixture envelope has no setup instructions");
  return {
    ...envelope,
    setupInstructions: [
      {
        ...create,
        accounts: create.accounts.map((a, p) => (p === index ? { ...a, ...patch } : a)),
      },
      ...rest,
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
  const transferAt = envelope.setupInstructions.findIndex((ix) => ix.accounts.length === 2);
  if (transferAt === -1) throw new Error("fixture envelope has no wrap transfer");
  return {
    ...envelope,
    setupInstructions: envelope.setupInstructions.map((ix, index) =>
      index === transferAt ? { ...ix, data: getBase64Codec().decode(Uint8Array.from(bytes)) } : ix,
    ),
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
 * @param {(envelope: Envelope) => Envelope | Promise<Envelope>} [mutate]
 * @param {Partial<import("@solos/actions").SwapAction>} [actionOverrides]
 */
export const runBranch = async (face, mutate, actionOverrides = {}) => {
  const fixture = startBuildFixture({
    responder: async (params) => {
      const envelope = await buildEnvelope({ taker: params.get("taker") ?? "" });
      return mutate ? mutate(envelope) : envelope;
    },
  });
  const layer = executorLayer(
    randomSeed(),
    JupiterSwapBuildLive({ baseUrl: fixture.url, apiKey: "test-jupiter-key" }),
  );
  try {
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
    return { error, requests: fixture.requests };
  } finally {
    fixture.stop();
  }
};
