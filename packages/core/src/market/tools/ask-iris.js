// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { AskIrisInputSchema } from "../domain/types.js";
import { askIris } from "../use-cases/ask-iris.js";

export const askIrisTool = defineTool({
  name: "solana_market_ask_iris",
  group: "market",
  tier: "read",
  stability: "beta",
  title: "Ask Iris about the market",
  description:
    "Ask Iris for current market context, catalysts, and risks behind one market question, " +
    "answered from live social and market intelligence. Every call spends Elfa API credits " +
    "and the response reports how many. Links appear only when the provider includes them.",
  input: AskIrisInputSchema,
  run: (input) => askIris(input),
});
