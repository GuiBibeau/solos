// @ts-check
import { getTokenDecoder } from "@solana-program/token";
import { Effect } from "effect";
import { guardMintRow, guardObligationRow } from "./kamino-deposit-guards.js";

/** @typedef {import("./kamino-deposit-plan.js").FetchedRow} Row */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} Rejection */
/** @param {string} reason @returns {Rejection} */
const reject = (reason) => ({ status: "reject", reason });

/** @param {Row | null | undefined} row @param {import("./kamino-deposit-plan.js").DepositIntent} intent @param {import("./kamino-deposit-plan.js").ReserveFacts} facts */
const destinationError = (row, intent, facts) => {
  if (row === null || row === undefined)
    return reject("the signer's destination token account is missing");
  if (row.owner !== facts.liquidityTokenProgram)
    return reject("the destination token program is incorrect");
  try {
    const token = getTokenDecoder().decode(row.bytes);
    if (token.owner !== intent.owner || token.mint !== intent.mint) {
      return reject("the destination account has the wrong owner or mint");
    }
  } catch {
    return reject("the destination token account cannot be decoded");
  }
  return null;
};

/** @param {Row | null | undefined} row @param {import("./kamino-deposit-plan.js").DepositIntent} intent @param {string} reserve */
const obligationBalance = (row, intent, reserve) => {
  if (row === null || row === undefined) return reject("no plain supply obligation exists");
  const checked = guardObligationRow(row, intent);
  if ("reason" in checked) return checked;
  const deposits = checked.state?.deposits ?? [];
  const matching = deposits.filter(
    (d) => d.depositReserve === reserve && BigInt(d.depositedAmount.toString()) > 0n,
  );
  if (matching.length !== 1) {
    return reject("no single supported supply position for this reserve in the plain obligation");
  }
  if (
    deposits.some((d) => d.depositReserve !== reserve && BigInt(d.depositedAmount.toString()) > 0n)
  ) {
    return reject("the obligation has other active reserves requiring a separate refresh plan");
  }
  return {
    balance: BigInt(
      /** @type {typeof matching[number]} */ (matching[0]).depositedAmount.toString(),
    ),
    reserves: deposits
      .filter((d) => BigInt(d.depositedAmount.toString()) > 0n)
      .map((d) => d.depositReserve),
  };
};

/** @param {{ reader: import("./kamino-deposit-plan.js").DepositReader; intent: import("./kamino-deposit-plan.js").DepositIntent; facts: import("./kamino-deposit-plan.js").ReserveFacts; obligation: string; destination: string }} input */
export const checkedWithdrawRows = ({ reader, intent, facts, obligation, destination }) =>
  Effect.gen(function* () {
    const [obligationRow, destRow, liquidityMint, collateralMint] = yield* reader.rows([
      obligation,
      destination,
      facts.liquidityMint,
      facts.collateralMint,
    ]);
    const mintError =
      guardMintRow(liquidityMint, "liquidity", facts.liquidityTokenProgram) ??
      guardMintRow(collateralMint, "collateral");
    if (mintError !== null) return mintError;
    const destError = destinationError(destRow, intent, facts);
    if (destError !== null) return destError;
    const balance = obligationBalance(obligationRow, intent, facts.reserve);
    if ("reason" in balance) return balance;
    return { ...balance, collateralProgram: /** @type {Row} */ (collateralMint).owner };
  });
