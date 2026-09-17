// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { GetPriceInputSchema } from "../domain/types.js";
import { getPrice } from "../use-cases/get-price.js";

export const getPriceTool = defineTool({
  name: "solana_market_get_price",
  group: "market",
  tier: "read",
  title: "Get token USD price",
  description:
    "Get the current USD price of one token mint from Jupiter's price feed. Returns the price " +
    "as an exact decimal string and the local receipt time. A mint Jupiter does not price is " +
    "reported as PriceUnavailable, never as a zero price.",
  input: GetPriceInputSchema,
  run: getPrice,
});
