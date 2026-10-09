// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { GetReserveInputSchema } from "../domain/types.js";
import { getReserve } from "../use-cases/get-reserve.js";

export const getReserveTool = defineTool({
  name: "solana_lend_get_reserve",
  group: "lend",
  tier: "read",
  stability: "beta",
  title: "Get Kamino reserve rates and liquidity",
  description:
    "Read one token's reserve in the configured Kamino lending market (Main Market by default): " +
    "the exact reserve address, its supply and borrow APYs as annual fractional decimals " +
    "excluding incentive rewards, and its available liquidity as the underlying token's exact " +
    "base-unit amount. Returns the market and reserve identities so later reads and execution " +
    "stay in the same market; a mint the configured market has no reserve for fails " +
    "ReserveUnavailable rather than answering from a different market. Rates are observations " +
    "and move every slot — they are not promised returns. Read-only: nothing is deposited, " +
    "withdrawn, signed, or sent.",
  input: GetReserveInputSchema,
  run: getReserve,
});
