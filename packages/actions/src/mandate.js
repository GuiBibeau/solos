// @ts-check
import { z } from "zod";
import { AddressSchema } from "./primitives.js";

/**
 * Constraints the agent should respect. Read-only input for the agent here; enforced by whatever
 * executor is configured (vault-engine when vaults are used, nothing in wallet mode).
 */
export const MandateSchema = z.object({
  id: z.string().min(1),
  objective: z.enum(["preserve", "balanced", "growth"]),
  maxDrawdownPct: z.number().min(0).max(100),
  maxPositionPct: z.number().min(0).max(100).describe("Max share of portfolio in one instrument"),
  maxLeverage: z.number().min(1).max(100).default(1),
  allowedProtocols: z.array(z.string()).describe("Empty means any"),
  allowedMints: z.array(AddressSchema).describe("Empty means any"),
});

/** @typedef {z.infer<typeof MandateSchema>} Mandate */
