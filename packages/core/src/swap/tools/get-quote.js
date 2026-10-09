// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { SwapQuoteRequestSchema } from "../domain/types.js";
import { getQuote } from "../use-cases/get-quote.js";

export const getQuoteTool = defineTool({
  name: "solana_swap_get_quote",
  group: "swap",
  tier: "read",
  stability: "beta",
  title: "Get indicative swap quote",
  description:
    "Get an indicative Jupiter swap quote for selling an amount of one mint for another: exact " +
    "input and output amounts in base units, the worst-case minimum output after slippage, price " +
    "impact as a decimal ratio, the routed hops, and a short local expiry. Routing is pinned to " +
    "Jupiter's Metis router. Nothing is sent or signed — a later execution re-quotes. Requires " +
    "JUPITER_API_KEY in the environment.",
  input: SwapQuoteRequestSchema,
  run: getQuote,
});
