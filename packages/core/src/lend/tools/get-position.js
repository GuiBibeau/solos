// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { GetLendPositionInputSchema } from "../domain/types.js";
import { getLendPosition } from "../use-cases/get-position.js";

export const getLendPositionTool = defineTool({
  name: "solana_lend_get_position",
  group: "lend",
  tier: "read",
  title: "Get a Kamino supply position",
  description:
    "Read one owner's total supplied amount for an underlying token in the configured " +
    "Kamino market. The exact base-unit amount is converted from collateral tokens at the " +
    "reserve exchange rate and rounded down once after aggregation. positions lists each " +
    "distinct contributing obligation; debt is never netted from supply. A known reserve " +
    "with no supply returns zero. owner defaults to the configured signer. Read-only: " +
    "nothing is deposited, withdrawn, signed, or sent.",
  input: GetLendPositionInputSchema,
  run: getLendPosition,
});
