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
  cleanupInstruction,
  cuPriceInstruction,
  destinationCreateInstruction,
  INPUT_MINT,
  INPUT_VAULT,
  LAST_VALID_BLOCK_HEIGHT,
  minOutFor,
  OUT_AMOUNT,
  OUTPUT_MINT,
  OUTPUT_VAULT,
  POOL_AUTHORITY,
  syncNativeInstruction,
  temporaryAtaCreateInstruction,
  wsolFundingInstruction,
} from "./jupiter-swap-build-bodies.js";
import { swapInstruction } from "./jupiter-swap-build-route-bodies.js";
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
 * The documented 200 body for the fixture pair: exact request echo, tolerance-floor minimum
 * output, real instructions in the documented buckets, resolved lookup tables, a 32-byte
 * blockhash, and the official fetchedAt object exactly as the provider sends it (the response
 * schema validates and strips it). `overrides` mutates one field at a time for rejection tests.
 * @param {{ taker: string; slippageBps?: number; overrides?: Record<string, unknown> }} options
 * @returns {Promise<import("./jupiter-swap-build-response.js").JupiterBuildEnvelope & {
 *   blockhashWithMetadata: { fetchedAt: { secs_since_epoch: number; nanos_since_epoch: number } };
 * }>}
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
      temporaryAtaCreateInstruction(taker, sourceAta, INPUT_MINT),
      wsolFundingInstruction(taker, sourceAta),
      syncNativeInstruction(sourceAta),
    ],
    swapInstruction: swapInstruction(taker, sourceAta, destinationAta),
    cleanupInstruction: cleanupInstruction(taker, sourceAta),
    otherInstructions: [],
    tipInstruction: null,
    addressesByLookupTableAddress: { [ALT_ADDRESS]: [POOL_AUTHORITY, INPUT_VAULT, OUTPUT_VAULT] },
    blockhashWithMetadata: {
      blockhash: [...BLOCKHASH_BYTES],
      lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT,
      fetchedAt: { secs_since_epoch: 1_700_000_000, nanos_since_epoch: 500_000_000 },
    },
    ...overrides,
  };
};

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
  DirectSignerExecutor().pipe(
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
