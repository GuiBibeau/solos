// @ts-check
import { OpenPerpActionSchema } from "@solos-sh/actions";
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import { executePerpOpen, simulatePerpOpen } from "../use-cases/open.js";

const OpenInput = z
  .object({
    market: OpenPerpActionSchema.shape.market.describe("Phoenix perpetual market symbol, e.g. SOL"),
    side: OpenPerpActionSchema.shape.side.describe("Long to buy or short to sell"),
    notionalUsd: OpenPerpActionSchema.shape.notionalUsd.describe(
      "Maximum order notional in integer 1e6 USD units",
    ),
    maxLeverage: OpenPerpActionSchema.shape.maxLeverage.describe(
      "Maximum requested leverage (1 through 100)",
    ),
    limitPriceUsd: OpenPerpActionSchema.shape.limitPriceUsd.describe(
      "Finite maximum buy or minimum sell price in USD per base token",
    ),
  })
  .strict();

export const simulatePerpOpenTool = defineTool({
  name: "solana_perp_simulate_open",
  group: "perp",
  tier: "simulate",
  title: "Simulate a bounded Phoenix IOC open",
  description:
    "Preview a price- and leverage-bounded Phoenix Perps position open without sending an order or funding collateral.",
  input: OpenInput,
  run: (input) => simulatePerpOpen(input),
});

export const executePerpOpenTool = defineTool({
  name: "solana_perp_execute_open",
  group: "perp",
  tier: "execute",
  title: "Submit a bounded Phoenix IOC open",
  description:
    "Submit a one-shot Phoenix Perps IOC open after preflight; confirmation does not guarantee a fill. Fund and verify the close path first.",
  input: OpenInput,
  run: (input) => executePerpOpen(input),
});
