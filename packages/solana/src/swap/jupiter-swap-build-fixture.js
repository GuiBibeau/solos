// @ts-check
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { DirectSignerExecutor } from "../executor/direct-signer-executor.js";
import { SolanaRpcLive } from "../rpc/solana-rpc.js";
import { KitSignerFromBytes } from "../signer/kit-signer.js";
import {
  ALT_ADDRESS,
  AMOUNT,
  BLOCKHASH_BYTES,
  INPUT_MINT,
  INPUT_VAULT,
  LAST_VALID_BLOCK_HEIGHT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  OUTPUT_VAULT,
  POOL_AUTHORITY,
  cleanupInstruction,
  destinationCreateInstruction,
  cuPriceInstruction,
  minOutFor,
  swapInstruction,
  wsolFundingInstruction,
} from "./jupiter-swap-build-bodies.js";
import { JupiterSwapBuild } from "./jupiter-swap-build-live.js";
import { TOKEN_PROGRAM } from "./jupiter-swap-build-validate.js";

/**
 * Drivers for the executor's Jupiter V2 build path: the canned documented envelope, a stub
 * build Layer for fully offline executor tests, and an executor stack whose RPC port is closed,
 * so any chain contact fails immediately and visibly. The loopback HTTP fixture lives with the
 * transport tests; canned instruction encodings live in jupiter-swap-build-bodies.js. Nothing
 * here contacts the real Jupiter endpoint.
 */

const TOKEN_PROGRAM_ADDRESS = address(TOKEN_PROGRAM);

/**
 * ATA derivation under the classic token program, exactly as the executor's checks derive it.
 * @param {string} owner
 * @param {string} mint
 */
const derivedAta = async (owner, mint) =>
  (
    await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(mint),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

/**
 * The taker's source and destination token accounts for the fixture pair.
 * @param {string} taker
 */
export const fixtureAtas = async (taker) => ({
  sourceAta: await derivedAta(taker, INPUT_MINT),
  destinationAta: await derivedAta(taker, OUTPUT_MINT),
});

/**
 * The documented 200 envelope for the fixture pair: exact request echo, tolerance-floor minimum
 * output, real instructions in the documented buckets, resolved lookup tables, and a 32-byte
 * blockhash. `overrides` mutates one field at a time for rejection tests.
 * @param {{ taker: string; slippageBps?: number; overrides?: Record<string, unknown> }} options
 * @returns {Promise<import("./jupiter-swap-build-response.js").JupiterBuildEnvelope>}
 */
export const buildEnvelope = async ({ taker, slippageBps = 50, overrides = {} }) => {
  const { sourceAta, destinationAta } = await fixtureAtas(taker);
  return {
    inputMint: INPUT_MINT,
    outputMint: OUTPUT_MINT,
    inAmount: AMOUNT,
    outAmount: OUT_AMOUNT,
    otherAmountThreshold: minOutFor(OUT_AMOUNT, slippageBps),
    swapMode: "ExactIn",
    slippageBps,
    routePlan: [{ bps: 10_000 }],
    computeBudgetInstructions: [cuPriceInstruction()],
    setupInstructions: [
      destinationCreateInstruction(taker, destinationAta),
      wsolFundingInstruction(taker, sourceAta),
    ],
    swapInstruction: swapInstruction(taker, sourceAta, destinationAta),
    cleanupInstruction: cleanupInstruction(taker, sourceAta),
    otherInstructions: [],
    tipInstruction: null,
    addressesByLookupTableAddress: { [ALT_ADDRESS]: [POOL_AUTHORITY, INPUT_VAULT, OUTPUT_VAULT] },
    blockhashWithMetadata: {
      blockhash: [...BLOCKHASH_BYTES],
      lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT,
      fetchedAt: 1_700_000_000_000,
    },
    ...overrides,
  };
};

/**
 * A JupiterSwapBuild Layer backed by the given async envelope factory instead of HTTP,
 * recording every build request it serves. Executor tests thus run the real branch offline.
 * @param {(params: import("./jupiter-swap-build-api.js").SwapBuildParams) => Promise<import("./jupiter-swap-build-response.js").JupiterBuildEnvelope>} envelopeFor
 * @param {import("./jupiter-swap-build-api.js").SwapBuildParams[]} [requests]
 */
export const stubBuildLayer = (envelopeFor, requests) =>
  Layer.succeed(JupiterSwapBuild, {
    build: (params) => {
      if (requests) requests.push(params);
      return Effect.promise(() => envelopeFor(params));
    },
  });

const DEAD_RPC_URL = "http://127.0.0.1:1";
const DEAD_WS_URL = "ws://127.0.0.1:2";

/**
 * The real DirectSignerExecutor over a throwaway signer and a closed RPC port: any chain
 * contact fails immediately with RpcError, so a test that sees another tag proves the branch
 * never dialled the chain.
 * @param {Uint8Array} seed
 * @param {Layer.Layer<import("./jupiter-swap-build-live.js").JupiterSwapBuildShape>} buildLayer
 */
export const executorLayer = (seed, buildLayer) =>
  DirectSignerExecutor.pipe(
    Layer.provide(
      Layer.mergeAll(
        KitSignerFromBytes(seed),
        SolanaRpcLive(DEAD_RPC_URL, DEAD_WS_URL),
        buildLayer,
      ),
    ),
  );

/**
 * Run an effect and return its tagged failure, or undefined when it unexpectedly succeeded.
 * @template E
 * @param {import("effect").Effect.Effect<unknown, E, never>} effect
 * @returns {Promise<E | undefined>}
 */
export const failureOf = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};
