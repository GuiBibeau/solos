// @ts-check
import { PortfolioStateSchema } from "@solos/actions";
import { walletHoldings } from "./holdings.js";
import { CASH_MINTS, WSOL_MINT, compareString } from "./mints.js";
import { assetValueScaled6, formatUsd, toScaled6 } from "./valuation.js";

/** @typedef {import("@solos/actions").Position} Position */
/** @typedef {Extract<Position, { kind: "lp" }>} LpPosition */
/** @typedef {Extract<Position, { kind: "lend" }>} LendPosition */
/** @typedef {{ readonly amount: bigint; readonly decimals: number }} HoldingAmount */
/** @typedef {ReadonlyMap<string, { readonly priceUsd: string }>} PriceMap */

/** Same identity rule the published PortfolioStateSchema refines on.
 * @param {Position} position */
const identityOf = (position) => {
  switch (position.kind) {
    case "lend": {
      return JSON.stringify([
        position.kind,
        position.protocol,
        position.market,
        position.instrument,
      ]);
    }
    case "perp": {
      return JSON.stringify([
        position.kind,
        position.protocol,
        position.account,
        position.instrument,
      ]);
    }
    case "lp": {
      return JSON.stringify([position.kind, position.protocol, position.position]);
    }
    default: {
      return JSON.stringify([position.kind, position.instrument]);
    }
  }
};
/** @param {Position} a @param {Position} b */
const byIdentity = (a, b) => identityOf(a).localeCompare(identityOf(b));

/**
 * One holding's USD value: null when unpriced (NAV impact only if the holding is nonzero).
 * @param {HoldingAmount} holding @param {string} mint @param {PriceMap} prices
 */
const valued = (holding, mint, prices) => {
  const price = prices.get(mint);
  return price && holding.amount !== 0n
    ? formatUsd(assetValueScaled6(holding.amount, holding.decimals, price.priceUsd))
    : null;
};

/** LP value needs both underlying prices; a zero principal position never blocks the NAV.
 * @param {LpPosition} position @param {PriceMap} prices */
const lpValued = (position, prices) => {
  const principal = BigInt(position.tokenA.amount) + BigInt(position.tokenB.amount);
  const priceA = prices.get(position.tokenA.mint);
  const priceB = prices.get(position.tokenB.mint);
  if (principal === 0n || !priceA || !priceB) return null;
  const scaledA = assetValueScaled6(
    BigInt(position.tokenA.amount),
    position.tokenA.decimals,
    priceA.priceUsd,
  );
  const scaledB = assetValueScaled6(
    BigInt(position.tokenB.amount),
    position.tokenB.decimals,
    priceB.priceUsd,
  );
  return formatUsd(scaledA + scaledB);
};

/** Venue positions valued at the observed prices; perp valueUsd stays null by contract.
 * @param {import("./holdings.js").VenueReads} venues @param {PriceMap} prices */
const valuedVenuePositions = (venues, prices) => [
  ...venues.lend.positions.map((position) =>
    position.kind === "lend"
      ? {
          ...position,
          valueUsd: valued(
            { amount: BigInt(position.amount), decimals: position.decimals },
            position.instrument,
            prices,
          ),
        }
      : position,
  ),
  ...venues.perp.positions,
  ...venues.liquidity.positions.map((position) =>
    position.kind === "lp" ? { ...position, valueUsd: lpValued(position, prices) } : position,
  ),
];

/** One holding's exact scaled USD contribution; null marks an unknown nonzero holding. */
/** @param {Position} entry */
const scaledContribution = (entry) => {
  if (entry.valueUsd !== null) return toScaled6(entry.valueUsd);
  const principal =
    entry.kind === "lp"
      ? BigInt(entry.tokenA.amount) + BigInt(entry.tokenB.amount)
      : BigInt(entry.amount);
  return principal === 0n ? 0n : null;
};

/** Unknown nonzero holdings or unknown account equity propagate null; zeros contribute zero. */
/** @param {readonly Position[]} holdings @param {readonly { protocol: string; account: string; equityUsd: string | null }[]} perpAccounts */
const valuationUsd = (holdings, perpAccounts) => {
  let total = 0n;
  let isKnown = true;
  for (const entry of holdings) {
    const scaled = entry.kind === "perp" ? 0n : scaledContribution(entry);
    if (scaled === null) isKnown = false;
    else total += scaled;
  }
  for (const account of perpAccounts) {
    if (account.equityUsd === null) isKnown = false;
    else total += toScaled6(account.equityUsd);
  }
  return isKnown ? formatUsd(total) : null;
};

/** @param {string} instrument @param {HoldingAmount} holding @param {PriceMap} prices */
const walletTokenPosition = (instrument, holding, prices) => ({
  kind: /** @type {"token"} */ ("token"),
  instrument,
  amount: holding.amount.toString(),
  decimals: holding.decimals,
  valueUsd: valued(holding, instrument === "SOL" ? WSOL_MINT : instrument, prices),
  protocol: null,
});

/** Distinct mints to observe: wSOL prices SOL, nonzero tokens price themselves, venues price their underlyings. */
/** @param {import("./holdings.js").WalletReads} reads @returns {string[]} */
export const mintsToPrice = (reads) => {
  const mints = new Set([WSOL_MINT, ...walletHoldings(reads).keys()]);
  for (const position of reads.venues.lend.positions) {
    if (position.kind === "lend" && !/^0+$/.test(position.amount)) mints.add(position.instrument);
  }
  for (const position of reads.venues.liquidity.positions) {
    if (position.kind !== "lp") continue;
    mints.add(position.tokenA.mint);
    mints.add(position.tokenB.mint);
  }
  return [...mints].toSorted(compareString);
};

/**
 * Assemble the published PortfolioState from one owner's wallet read, the three venue
 * enumerations and observed prices. Pure: the caller owns every byte on the wire.
 * @param {import("./holdings.js").WalletReads & { readonly owner: string; readonly prices: ReadonlyMap<string, { readonly priceUsd: string }>; readonly at: number }} input
 * @returns {import("@solos/actions").PortfolioState}
 */
export const assembleState = (input) => {
  const { owner, lamports, tokenBalances, venues, prices, at } = input;
  const reads = { lamports, tokenBalances, venues };
  const cash = [
    walletTokenPosition("SOL", { amount: lamports, decimals: 9 }, prices),
    ...[...walletHoldings(reads)]
      .filter(([mint]) => CASH_MINTS.has(mint))
      .map(([mint, holding]) => walletTokenPosition(mint, holding, prices)),
  ].toSorted(byIdentity);
  const positions = [
    ...[...walletHoldings(reads)]
      .filter(([mint]) => !CASH_MINTS.has(mint))
      .map(([mint, holding]) => walletTokenPosition(mint, holding, prices)),
    ...valuedVenuePositions(venues, prices),
  ].toSorted(byIdentity);
  const perpAccounts = [...venues.lend.perpAccounts, ...venues.perp.perpAccounts].toSorted(
    (a, b) => a.protocol.localeCompare(b.protocol) || a.account.localeCompare(b.account),
  );
  return PortfolioStateSchema.parse({
    owner,
    valuationUsd: valuationUsd([...cash, ...positions], perpAccounts),
    cash,
    positions,
    perpAccounts,
    at,
  });
};
