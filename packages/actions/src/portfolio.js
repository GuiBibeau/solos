// @ts-check
import { z } from "zod";
import { PerpAccountSchema, PositionSchema, TokenPositionSchema } from "./positions.js";
import { AddressSchema, DecimalSchema, TimestampSchema } from "./primitives.js";

/** What the agent reads before deciding; a supported-asset view, never a claim of full net worth. */
export const PortfolioStateSchema = z
  .object({
    owner: AddressSchema,
    valuationUsd: DecimalSchema.nullable(),
    cash: z
      .array(TokenPositionSchema)
      .describe("Native SOL and recognized stablecoins; wallet holdings only"),
    positions: z.array(PositionSchema),
    perpAccounts: z
      .array(PerpAccountSchema)
      .default([])
      .describe("One equity observation per unique trader account"),
    at: TimestampSchema,
  })
  .refine(
    (value) =>
      new Set(value.perpAccounts.map((entry) => entry.account)).size === value.perpAccounts.length,
    {
      message: "each trader account equity must appear once",
    },
  )
  .refine(
    (value) =>
      value.positions.every(
        (position) =>
          position.kind !== "perp" ||
          value.perpAccounts.some((entry) => entry.account === position.account),
      ),
    {
      message: "every perp position needs a matching account equity observation",
    },
  );

export { PositionSchema } from "./positions.js";
/** @typedef {import("./positions.js").Position} Position */
/** @typedef {z.infer<typeof PortfolioStateSchema>} PortfolioState */
