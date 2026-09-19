// @ts-check
import { z } from "zod";
import { PerpAccountSchema, PositionSchema, TokenPositionSchema } from "./positions.js";
import { AddressSchema, DecimalSchema, TimestampSchema } from "./primitives.js";

/** @param {import("./positions.js").Position} position */
const positionIdentity = (position) => {
  switch (position.kind) {
    case "token": {
      return JSON.stringify([position.kind, position.instrument]);
    }
    case "lend": {
      return JSON.stringify([
        position.kind,
        position.protocol,
        position.market,
        position.instrument,
      ]);
    }
    case "perp": {
      return JSON.stringify([
        position.kind,
        position.protocol,
        position.account,
        position.instrument,
      ]);
    }
    case "lp": {
      return JSON.stringify([position.kind, position.protocol, position.position]);
    }
  }
};

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
    (value) => {
      const holdings = [...value.cash, ...value.positions];
      return new Set(holdings.map(positionIdentity)).size === holdings.length;
    },
    {
      message: "each position identity must appear once across cash and positions",
    },
  )
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
