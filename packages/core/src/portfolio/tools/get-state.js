// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { PortfolioStateInputSchema } from "../domain/types.js";
import { getState } from "../use-cases/get-state.js";

export const getStateTool = defineTool({
  name: "solana_portfolio_get_state",
  group: "portfolio",
  tier: "read",
  title: "Get portfolio state",
  description:
    "Read one owner's supported-portfolio state: cash (native SOL and recognized stablecoins), " +
    "wallet token, lending, LP and perp positions, one equity observation per trader account, " +
    "and a USD valuation when every nonzero holding and account is priced. A supported-assets " +
    "view, never a claim of full net worth; unknown prices keep valuation null instead of " +
    "inventing numbers. Defaults to the configured signer when no owner is given.",
  input: PortfolioStateInputSchema,
  run: (input) => getState(input),
});
