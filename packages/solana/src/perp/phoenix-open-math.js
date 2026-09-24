// @ts-check
import { BuildRejected } from "@solos/core";

const MAX_U64 = 18_446_744_073_709_551_615n;

/** @param {readonly {upperBoundSize:bigint;maxLeverage:bigint}[]} tiers @param {bigint} lots */
export const protocolLeverageForLots = (tiers, lots) => {
  const tier = tiers.find((entry) => lots <= entry.upperBoundSize);
  if (!tier || tier.maxLeverage < 1n)
    throw new BuildRejected({ reason: "Phoenix market leverage tier is unknown at this size" });
  return tier.maxLeverage;
};
/** @param {bigint} numerator @param {bigint} divisor */
const ceilDiv = (numerator, divisor) => (numerator + divisor - 1n) / divisor;

/** @param {string} decimal */
const decimalParts = (decimal) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(decimal) || !/[1-9]/.test(decimal))
    throw new BuildRejected({ reason: "Phoenix price must be a positive exact decimal" });
  const parts = decimal.split(".");
  const digits = `${parts[0]}${parts[1] ?? ""}`;
  return { value: BigInt(digits), scale: 10n ** BigInt(parts[1]?.length ?? 0) };
};

/** @param {bigint} required @param {bigint} equity */
const requireCollateral = (required, equity) => {
  if (equity < required)
    throw new BuildRejected({
      reason: `insufficient available Phoenix trader collateral: minimum needed ${required} quote lots, shortfall ${required - equity}; use explicit perp deposit before opening`,
    });
};

/** @param {{maxLeverage:number;notionalUsd:string}} input @param {bigint} equity @param {bigint} exposure */
const checkLeverage = (input, equity, exposure) => {
  const { value, scale } = decimalParts(String(input.maxLeverage));
  const total = exposure + BigInt(input.notionalUsd);
  if (value === 0n || exposure < 0n)
    throw new BuildRejected({ reason: "Phoenix account equity or exposure cannot be verified" });
  requireCollateral(ceilDiv(total * scale, value), equity);
};

/** @param {{tickSize:bigint;baseLotDecimals:number}} market @param {string} price */
export const pricePerLot = (market, price) => {
  const { value, scale } = decimalParts(price);
  if (market.tickSize <= 0n || Math.abs(market.baseLotDecimals) > 18)
    throw new BuildRejected({ reason: "Phoenix market tick or lot size is unsupported" });
  const divisor = 10n ** BigInt(Math.abs(market.baseLotDecimals));
  const lotNumerator = market.baseLotDecimals >= 0 ? 1n : divisor;
  const lotDenominator = market.baseLotDecimals >= 0 ? divisor : 1n;
  return { numerator: value * 1_000_000n * lotNumerator, denominator: scale * lotDenominator };
};

/** @param {"long" | "short"} side @param {bigint} numerator @param {bigint} denominator */
export const priceTicks = (side, numerator, denominator) =>
  side === "long" ? numerator / denominator : ceilDiv(numerator, denominator);

/** Convert exact USD to finite IOC ticks and conservative base lots; quote cap is the input.
 * @param {{input:{notionalUsd:string;limitPriceUsd:string;maxLeverage:number;side:"long" | "short"};market:{tickSize:bigint;baseLotDecimals:number;protocolMaxLeverage:bigint};equity:bigint;exposure:bigint;observedSlot:bigint}} facts */
export const planOpenLots = ({ input, market, equity, exposure, observedSlot }) => {
  if (input.maxLeverage > Number(market.protocolMaxLeverage))
    throw new BuildRejected({ reason: "requested leverage exceeds the Phoenix market tier" });
  const notional = BigInt(input.notionalUsd);
  const { numerator, denominator } = pricePerLot(market, input.limitPriceUsd);
  const priceInTicks = priceTicks(input.side, numerator, denominator * market.tickSize);
  // Sell ticks round upward: size against the actual executable tick, never the lower
  // user limit price, so even the last base lot cannot exceed the quote budget.
  const numBaseLots = notional / (priceInTicks * market.tickSize);
  if (priceInTicks <= 0n || priceInTicks > MAX_U64 || numBaseLots <= 0n || numBaseLots > MAX_U64)
    throw new BuildRejected({ reason: "Phoenix bounded order is dust or overflows u64" });
  checkLeverage(input, equity, exposure);
  return { priceInTicks, numBaseLots, numQuoteLots: notional, lastValidSlot: observedSlot + 16n };
};
