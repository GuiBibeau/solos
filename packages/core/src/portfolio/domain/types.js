// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";

/**
 * One portfolio read: whose supported holdings to aggregate. Omitted means the configured
 * signer; an explicit owner is honored verbatim (ADR-0018).
 */
export const PortfolioStateInputSchema = z.object({
  owner: AddressSchema.optional().describe(
    "Owner to read. Omit to use the configured signer's address.",
  ),
});

/** @typedef {z.infer<typeof PortfolioStateInputSchema>} PortfolioStateInput */
