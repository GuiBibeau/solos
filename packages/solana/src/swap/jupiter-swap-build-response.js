// @ts-check
import {
  QuoteAuthFailed,
  QuoteHttpError,
  QuoteNetworkError,
  QuoteRateLimited,
  QuoteResponseInvalid,
  QuoteTimeout,
} from "@solos/core";
import { Effect } from "effect";
import { z } from "zod";
import { isDeadlineAbort } from "../market/elfa-api.js";
import { DEFAULT_TIMEOUT_MS } from "./jupiter-swap-api.js";
import { jupiterSwapBuild } from "./jupiter-swap-build-api.js";

/**
 * Envelope and transport mapping for the Jupiter Swap V2 build endpoint (`GET /swap/v2/build`).
 * The raw instruction objects stay raw here — program ids, account metas, and base64 data are
 * decoded by the assembler only after validation. Parsed in strip mode so provider extensions
 * never break us, and never trusted: the semantic checks live in jupiter-swap-build-validate.js.
 */

/** Instruction exactly as the provider documents it; data is base64. */
const RawInstructionSchema = z.object({
  programId: z.string().min(1),
  accounts: z.array(
    z
      .object({
        pubkey: z.string().min(1),
        isWritable: z.boolean(),
        isSigner: z.boolean(),
      })
      .strip(),
  ),
  data: z.string(),
});

const RouteLegSchema = z.object({ bps: z.number().int().min(1).max(10_000) }).strip();

/** Documented 200 envelope. The blockhash is exactly 32 bytes of numbers, never a string. */
export const BuildEnvelopeSchema = z
  .object({
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string(),
    outAmount: z.string(),
    otherAmountThreshold: z.string().optional(),
    swapMode: z.string(),
    slippageBps: z.number().int().min(0).max(10_000),
    routePlan: z.array(RouteLegSchema),
    computeBudgetInstructions: z.array(RawInstructionSchema),
    setupInstructions: z.array(RawInstructionSchema),
    swapInstruction: RawInstructionSchema,
    cleanupInstruction: RawInstructionSchema.nullable(),
    otherInstructions: z.array(RawInstructionSchema),
    tipInstruction: RawInstructionSchema.nullable(),
    addressesByLookupTableAddress: z
      .record(z.string().min(1), z.array(z.string().min(1)))
      .nullable(),
    blockhashWithMetadata: z
      .object({
        blockhash: z.array(z.number().int().min(0).max(255)).length(32),
        lastValidBlockHeight: z.number().int().min(1),
        fetchedAt: z.number().int().optional(),
      })
      .strip(),
  })
  .strip();

/** @typedef {z.infer<typeof RawInstructionSchema>} RawInstruction */
/** @typedef {z.infer<typeof BuildEnvelopeSchema>} JupiterBuildEnvelope */

/** @param {string} body @returns {unknown} */
const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/**
 * Non-2xx status to the slice error, or undefined for 2xx. Bodies stay redacted: a 400 build
 * rejection is a fixed reason, never the provider's message.
 * @param {import("./jupiter-swap-api.js").JupiterSwapOutcome} outcome
 * @returns {import("@solos/core").SwapQuoteError | undefined}
 */
const statusError = (outcome) => {
  if (outcome.status === 401 || outcome.status === 403)
    return new QuoteAuthFailed({ status: outcome.status });
  if (outcome.status === 429) return new QuoteRateLimited({ status: outcome.status });
  if (outcome.status < 200 || outcome.status >= 300) {
    return new QuoteHttpError({
      status: outcome.status,
      reason: `Jupiter answered with HTTP ${outcome.status}`,
    });
  }
  return undefined;
};

/**
 * Translate one build outcome into the validated envelope or a slice-owned error. Envelope
 * mismatches are QuoteResponseInvalid; they never carry body text.
 * @param {import("./jupiter-swap-api.js").JupiterSwapOutcome} outcome
 */
const fromOutcome = (outcome) => {
  const failed = statusError(outcome);
  if (failed) return Effect.fail(failed);
  const parsed = BuildEnvelopeSchema.safeParse(parseJson(outcome.body));
  if (!parsed.success) {
    return Effect.fail(
      new QuoteResponseInvalid({
        status: outcome.status,
        reason: "response did not match the documented build envelope",
      }),
    );
  }
  return Effect.succeed(parsed.data);
};

/**
 * One build fetch through the transport, translated to the slice error channel. Single attempt:
 * a deadline abort is a QuoteTimeout and any other transport failure a QuoteNetworkError —
 * neither is retried, and a failed build can never become a send.
 * @param {import("./jupiter-swap-build-api.js").SwapBuildParams} params
 * @param {import("./jupiter-swap-api.js").JupiterSwapConfig} config
 */
export const fetchBuild = (params, config) => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Effect.tryPromise({
    try: () => jupiterSwapBuild(config, params),
    catch: (error) =>
      isDeadlineAbort(error)
        ? new QuoteTimeout({ timeoutMs })
        : new QuoteNetworkError({ reason: "Jupiter swap build request failed" }),
  }).pipe(Effect.flatMap(fromOutcome));
};
