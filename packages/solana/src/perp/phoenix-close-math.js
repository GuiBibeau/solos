// @ts-check
import { BuildRejected, NoPositionToClose } from "@solos/core";
import { pricePerLot, priceTicks } from "./phoenix-open-math.js";

const MAX_U64 = 18_446_744_073_709_551_615n;

/** The protocol ReduceOnly bit is an independent on-chain guarantee. Base lots additionally
 * cannot exceed the position read before signing; no quote cap is requested by a close intent.
 * @param {{positionLots:bigint;market:{tickSize:bigint;baseLotDecimals:number};limitPriceUsd:string;observedSlot:bigint;symbol:string}} facts */
export const planCloseLots = ({ positionLots, market, limitPriceUsd, observedSlot, symbol }) => {
  if (positionLots === 0n) throw new NoPositionToClose({ market: symbol });
  const side = /** @type {"short" | "long"} */ (positionLots > 0n ? "short" : "long");
  const { numerator, denominator } = pricePerLot(market, limitPriceUsd);
  const priceInTicks = priceTicks(side, numerator, denominator * market.tickSize);
  const numBaseLots = positionLots < 0n ? -positionLots : positionLots;
  if (priceInTicks <= 0n || priceInTicks > MAX_U64 || numBaseLots <= 0n || numBaseLots > MAX_U64)
    throw new BuildRejected({
      reason: "Phoenix reduce-only close limit or quantity is unsupported",
    });
  return { side, priceInTicks, numBaseLots, numQuoteLots: null, lastValidSlot: observedSlot + 16n };
};
