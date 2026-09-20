// @ts-check
import { getBase64Codec, isAddress } from "@solana/kit";
import { z } from "zod";

/** The provider build envelope, parsed strictly at the transport boundary. */

/** @param {string} value @returns {boolean} */
const isCanonicalAddress = (value) => isAddress(value) === true;

const AddressStringSchema = z.string().refine(isCanonicalAddress, {
  message: "not a canonical 32-byte base58 Solana address",
});

const CanonicalBase64Schema = z
  .string()
  .refine(
    (value) =>
      value.length % 4 === 0 &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(value) &&
      getBase64Codec().decode(getBase64Codec().encode(value)) === value,
    { message: "not canonical base64" },
  );

const RawInstructionSchema = z.object({
  programId: AddressStringSchema,
  accounts: z.array(
    z
      .object({
        pubkey: AddressStringSchema,
        isWritable: z.boolean(),
        isSigner: z.boolean(),
      })
      .strip(),
  ),
  data: CanonicalBase64Schema,
});

const RouteLegSchema = z.object({ bps: z.number().int().min(1).max(10_000) }).strip();

export const BuildEnvelopeSchema = z
  .object({
    inputMint: AddressStringSchema,
    outputMint: AddressStringSchema,
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
      .record(AddressStringSchema, z.array(AddressStringSchema))
      .nullable(),
    blockhashWithMetadata: z
      .object({
        blockhash: z.array(z.number().int().min(0).max(255)).length(32),
        lastValidBlockHeight: z.number().int().min(1),
        fetchedAt: z
          .object({
            secs_since_epoch: z.number().int().min(0),
            nanos_since_epoch: z.number().int().min(0),
          })
          .strip(),
      })
      .strip()
      .transform((meta) => ({
        blockhash: meta.blockhash,
        lastValidBlockHeight: meta.lastValidBlockHeight,
      })),
  })
  .strip();

/** @typedef {z.infer<typeof RawInstructionSchema>} RawInstruction */
/** @typedef {z.infer<typeof BuildEnvelopeSchema>} JupiterBuildEnvelope */
