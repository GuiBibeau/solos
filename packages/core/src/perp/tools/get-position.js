// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { normalizeMarketSymbol } from "../domain/symbol.js";
import { GetPositionInputSchema } from "../domain/types.js";
import { getPosition } from "../use-cases/get-position.js";

export const getPositionTool = defineTool({
  name: "solana_perp_get_position",
  group: "perp",
  tier: "read",
  stability: "beta",
  title: "Get Phoenix perp position",
  description:
    "Read one Phoenix perp position with an explicit long/short/flat side, absolute base " +
    "exposure, and the trader account's signed USD equity (null when it cannot be justified). " +
    "Flat means exactly zero; a valid market with no account is a zero-position success, not " +
    "an error.",
  input: GetPositionInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a bad
  // symbol never builds the Layers at all.
  check: (input) => {
    normalizeMarketSymbol(input.market);
  },
  run: (input) => getPosition(input),
});
