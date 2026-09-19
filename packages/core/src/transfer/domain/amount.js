// @ts-check
import { ValidationError } from "../../shared/domain/errors.js";
import { solToLamports } from "../../shared/domain/lamports.js";

const DECIMAL_REASON = "amountSol must be a decimal SOL amount, e.g. 0.1 (max 9 decimals)";
const MINIMUM_REASON = "transfer must move at least 1 lamport";

/** @param {string | number} amountSol @param {string} reason */
const reject = (amountSol, reason) =>
  new ValidationError({ field: "amountSol", value: amountSol, reason });

/**
 * Parse the tool-facing SOL amount into lamports and enforce the transfer minimum of one lamport.
 * A pure domain rule: it runs before the signer, the RPC, or any Action is built (ADR-0004,
 * ADR-0013), so zero and sub-lamport amounts fail as a structured ValidationError everywhere.
 * @param {string | number} amountSol
 * @returns {bigint}
 */
export const transferLamports = (amountSol) => {
  /** @type {bigint} */
  let lamports;
  try {
    lamports = solToLamports(amountSol);
  } catch {
    throw reject(amountSol, DECIMAL_REASON);
  }
  if (lamports <= 0n) throw reject(amountSol, MINIMUM_REASON);
  return lamports;
};
