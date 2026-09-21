// @ts-check
import { Effect } from "effect";
import { BalanceReader, Signer } from "../../wallet/index.js";
import { transferLamports } from "../domain/amount.js";
import { InsufficientFunds } from "../domain/errors.js";
import { TRANSFER_FEE_RESERVE_LAMPORTS } from "../domain/fees.js";

/** @typedef {InsufficientFunds | import("../../shared/domain/errors.js").ValidationError | import("../../shared/domain/errors.js").RpcError | import("../../shared/index.js").SignerUnavailable} ResolveError */
/** @typedef {import("../../wallet/index.js").SignerShape | import("../../wallet/index.js").BalanceReaderShape} ResolveContext */

/**
 * Turn tool input into a request: reject non-positive amounts, then resolve the sender and check
 * funds up front so each failure is a domain error, not an executor error after signing.
 * @param {import("../domain/types.js").TransferSolInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").TransferSolRequest, ResolveError, ResolveContext>}
 */
export const resolveRequest = (input) =>
  Effect.gen(function* () {
    const lamports = yield* Effect.try({
      try: () => transferLamports(input.amountSol),
      catch: (error) =>
        /** @type {import("../../shared/domain/errors.js").ValidationError} */ (error),
    });
    const from = yield* (yield* Signer).address();
    const available = yield* (yield* BalanceReader).getLamports(from);
    const required = lamports + TRANSFER_FEE_RESERVE_LAMPORTS;
    if (available < required) {
      return yield* new InsufficientFunds({
        owner: from,
        required: required.toString(),
        available: available.toString(),
      });
    }
    return { from, to: input.to, lamports, skipSimulation: input.skipSimulation };
  });
