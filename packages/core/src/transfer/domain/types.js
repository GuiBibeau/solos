// @ts-check
import { z } from "zod";
import { AddressSchema, SignatureSchema } from "../../shared/domain/address.js";
import { SolAmountSchema } from "../../shared/domain/lamports.js";

/** Tool-facing input: SOL as decimal, optional simulation skip. */
export const TransferSolInputSchema = z.object({
  to: AddressSchema.describe("Recipient wallet address"),
  amountSol: SolAmountSchema.describe("Amount of SOL to send, e.g. 0.1"),
  skipSimulation: z
    .boolean()
    .default(false)
    .describe("Send without a prior simulateTransaction. Default false."),
});

/** @typedef {z.infer<typeof TransferSolInputSchema>} TransferSolInput */

/** Resolved request handed to the port: lamports as bigint, sender known. */
export const TransferSolRequestSchema = z.object({
  from: AddressSchema,
  to: AddressSchema,
  lamports: z.bigint().positive(),
  skipSimulation: z.boolean(),
});

/** @typedef {z.infer<typeof TransferSolRequestSchema>} TransferSolRequest */

export const SimulationResultSchema = z.object({
  from: AddressSchema,
  to: AddressSchema,
  lamports: z.string(),
  unitsConsumed: z.string().describe("Compute units the transaction would consume"),
  logs: z.array(z.string()),
});

/** @typedef {z.infer<typeof SimulationResultSchema>} SimulationResult */

export const TransferReceiptSchema = z.object({
  signature: SignatureSchema,
  from: AddressSchema,
  to: AddressSchema,
  lamports: z.string(),
  simulated: z.boolean().describe("Whether a simulation ran before sending"),
});

/** @typedef {z.infer<typeof TransferReceiptSchema>} TransferReceipt */
