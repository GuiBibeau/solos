// @ts-check
import { ClosePerpActionSchema } from "@solos-sh/actions";
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import { simulatePerpClose, executePerpClose } from "../use-cases/close.js";

const CloseInput = z
  .object({
    market: ClosePerpActionSchema.shape.market.describe(
      "Phoenix perpetual market symbol, e.g. SOL",
    ),
    limitPriceUsd: ClosePerpActionSchema.shape.limitPriceUsd.describe(
      "Finite minimum sell or maximum buy price in USD per base token",
    ),
  })
  .strict();

export const simulatePerpCloseTool = defineTool({
  name: "solana_perp_simulate_close",
  group: "perp",
  tier: "simulate",
  stability: "stable",
  action: "close_perp",
  title: "Simulate a reduce-only Phoenix IOC close",
  description:
    "Preview closing an existing Phoenix Perps position with a finite limit, without sending an order.",
  input: CloseInput,
  run: (input) => simulatePerpClose(input),
});

export const executePerpCloseTool = defineTool({
  name: "solana_perp_execute_close",
  group: "perp",
  tier: "execute",
  stability: "stable",
  action: "close_perp",
  title: "Submit a reduce-only Phoenix IOC close",
  description:
    "Submit one reduce-only IOC close for the current signed position; confirmation is not proof it filled. Read residual exposure.",
  input: CloseInput,
  run: (input) => executePerpClose(input),
});
