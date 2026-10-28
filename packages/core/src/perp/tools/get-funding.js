// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { GetFundingInputSchema } from "../domain/funding.js";
import { normalizeMarketSymbol } from "../domain/symbol.js";
import { getFunding } from "../use-cases/get-funding.js";

export const getFundingTool = defineTool({
  name: "solana_perp_get_funding",
  group: "perp",
  tier: "read",
  stability: "beta",
  title: "Get Phoenix perp funding",
  description:
    "What is this Phoenix perp's funding rate right now, and what did it print over the " +
    "lookback? Positive rateHourlyPct means longs pay shorts. History is empty when the " +
    "venue has only the current rate.",
  input: GetFundingInputSchema,
  check: (input) => {
    normalizeMarketSymbol(input.market);
  },
  run: (input) => getFunding(input),
});
