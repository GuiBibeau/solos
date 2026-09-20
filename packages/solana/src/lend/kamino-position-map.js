// @ts-check
import {
  LendPositionSchema,
  LendingEnumerationIncomplete,
  LendingObligationInvalid,
} from "@solos/core/lend";
import { Effect } from "effect";
import { collateralToLiquidity } from "./kamino-position-math.js";

const MAX_ACCOUNTS = 4096;
const MAX_POSITIONS = 256;
const MAX_PAGES = 32;
const ZERO_ADDRESS = "11111111111111111111111111111111";

/** @typedef {{ readonly address: string; readonly market: string; readonly owner: string; readonly deposits: ReadonlyArray<{ readonly reserve: string; readonly collateral: string }> }} ObligationRow */
/** @typedef {{ readonly address: string; readonly mint: string; readonly receiptMint: string; readonly decimals: number; readonly cTokenSupply: string; readonly totalSupply: string }} PositionReserve */

/** @param {ReadonlyArray<ObligationRow>} rows */
const uniqueObligations = (rows) => {
  /** @type {Map<string, ObligationRow>} */
  const unique = new Map();
  for (const row of rows) {
    const prior = unique.get(row.address);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) {
      throw new LendingObligationInvalid({
        obligation: row.address,
        reason: "the RPC returned conflicting records for one obligation",
      });
    }
    unique.set(row.address, row);
  }
  // Iterator helpers are not in the repository's TypeScript lib target yet.
  // eslint-disable-next-line unicorn/prefer-iterator-to-array
  return [...unique.values()];
};

/** @param {ReadonlyArray<ObligationRow>} rows @param {PositionReserve} reserve */
const collateralForReserve = (rows, reserve) => {
  let collateral = 0n;
  /** @type {string[]} */
  const contributors = [];
  for (const row of rows) {
    let obligationCollateral = 0n;
    for (const deposit of row.deposits) {
      if (deposit.reserve === reserve.address) obligationCollateral += BigInt(deposit.collateral);
    }
    if (obligationCollateral > 0n) contributors.push(row.address);
    collateral += obligationCollateral;
  }
  return { collateral, contributors: contributors.toSorted((a, b) => a.localeCompare(b)) };
};

/** @param {ReadonlyArray<ObligationRow>} rows @param {Set<string>} known */
const unknownDeposit = (rows, known) =>
  rows
    .flatMap((row) => row.deposits.map((deposit) => ({ deposit, obligation: row.address })))
    .find(
      ({ deposit }) =>
        deposit.reserve !== ZERO_ADDRESS &&
        BigInt(deposit.collateral) > 0n &&
        !known.has(deposit.reserve),
    );

/** @param {ReadonlyArray<ObligationRow>} rows @param {Set<string>} known */
const activeReserves = (rows, known) =>
  new Set(
    rows.flatMap((row) =>
      row.deposits
        .filter((deposit) => BigInt(deposit.collateral) > 0n && known.has(deposit.reserve))
        .map((deposit) => deposit.reserve),
    ),
  );

/** @param {PositionReserve} reserve @param {ReadonlyArray<ObligationRow>} rows @param {string} market */
export const mapLendPosition = (reserve, rows, market) => {
  const total = collateralForReserve(uniqueObligations(rows), reserve);
  return LendPositionSchema.parse({
    kind: "lend",
    protocol: "kamino",
    instrument: reserve.mint,
    market,
    amount: collateralToLiquidity(
      total.collateral,
      reserve.cTokenSupply,
      reserve.totalSupply,
    ).toString(),
    decimals: reserve.decimals,
    valueUsd: null,
    positions: total.contributors,
  });
};

/**
 * Map a complete scan. Any bound or unknown nonzero reserve fails the entire enumeration.
 * @param {{ rows: ReadonlyArray<ObligationRow>; reserves: ReadonlyArray<PositionReserve>; market: string; pages?: number }} input
 */
export const mapLendEnumeration = (input) =>
  Effect.try({
    try: () => buildEnumeration(input),
    catch: (error) =>
      error instanceof LendingEnumerationIncomplete || error instanceof LendingObligationInvalid
        ? error
        : new LendingObligationInvalid({
            obligation: ZERO_ADDRESS,
            reason: "obligation amounts or reserve exchange rates are invalid",
          }),
  });

/** @param {{ rows: ReadonlyArray<ObligationRow>; reserves: ReadonlyArray<PositionReserve>; market: string; pages?: number }} input */
const buildEnumeration = (input) => {
  if ((input.pages ?? 1) > MAX_PAGES || input.rows.length > MAX_ACCOUNTS) {
    throw new LendingEnumerationIncomplete({ reason: "Kamino obligation scan exceeded its bound" });
  }
  const rows = uniqueObligations(input.rows);
  const known = new Set(input.reserves.map((reserve) => reserve.address));
  const unknown = unknownDeposit(rows, known);
  if (unknown) {
    throw new LendingObligationInvalid({
      obligation: unknown.obligation,
      reason: "a supply deposit references an unsupported reserve",
    });
  }
  const active = activeReserves(rows, known);
  if (active.size > MAX_POSITIONS) {
    throw new LendingEnumerationIncomplete({
      reason: "Kamino position enumeration exceeded 256 positions",
    });
  }
  const positions = input.reserves
    .filter((reserve) => active.has(reserve.address))
    .map((reserve) => mapLendPosition(reserve, rows, input.market))
    .toSorted((a, b) => a.instrument.localeCompare(b.instrument));
  const receiptMints = input.reserves
    .filter((reserve) => positions.some((position) => position.instrument === reserve.mint))
    .map((reserve) => reserve.receiptMint);
  return {
    positions,
    perpAccounts: /** @type {[]} */ ([]),
    receiptMints: [...new Set(receiptMints)].toSorted((a, b) => a.localeCompare(b)),
  };
};
