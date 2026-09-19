// @ts-check
import { PerpAccountSchema, PerpPositionSchema } from "@solos/actions";
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";

/** @typedef {import("../../shared/domain/address.js").Address} Address */

/** @typedef {z.infer<typeof PerpPositionSchema>} PerpPosition */
/** @typedef {z.infer<typeof PerpAccountSchema>} PerpAccount */

/** @typedef {z.infer<typeof GetPositionInputSchema>} GetPositionInput */
/** @typedef {z.infer<typeof ListPositionsInputSchema>} ListPositionsInput */

/**
 * One position read, after input validation: `market` is the normalized wire symbol and
 * `owner` is always explicit (the use case resolved the default from the wallet Signer).
 * @typedef {{ readonly market: string; readonly owner: Address }} GetPositionRequest
 */

/**
 * Point read result (ADR-0021): the position plus the shared-account equity record.
 * @typedef {{ readonly position: PerpPosition; readonly account: PerpAccount }} GetPositionResult
 */

/**
 * Complete owner enumeration (ADR-0018). Perp positions represent no wallet claims, so
 * `receiptMints` is empty; the shared account equity appears exactly once, even when flat.
 * @typedef {{
 *   readonly positions: PerpPosition[];
 *   readonly perpAccounts: PerpAccount[];
 *   readonly receiptMints: Address[];
 * }} PerpEnumeration
 */

/**
 * One Phoenix perp position read: the market symbol, and optionally whose trader account to
 * read. `market` is normalized to the exchange symbol ("SOL-PERP" and "sol" both mean "SOL");
 * an omitted owner means the configured signer.
 */
export const GetPositionInputSchema = z.object({
  market: z
    .string()
    .min(1)
    .max(32)
    .describe("Perp market symbol, e.g. SOL or SOL-PERP (normalized to the exchange symbol)"),
  owner: AddressSchema
    .optional()
    .describe("Trader address to read. Defaults to the configured signer wallet"),
});

/** One owner enumeration: whose trader account to list. Omitted means the configured signer. */
export const ListPositionsInputSchema = z.object({
  owner: AddressSchema
    .optional()
    .describe("Trader address to enumerate. Defaults to the configured signer wallet"),
});

export { PerpAccountSchema, PerpPositionSchema };
