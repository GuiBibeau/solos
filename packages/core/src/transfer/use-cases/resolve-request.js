// @ts-check
import { Effect } from "effect";
import { solToLamports } from "../../shared/domain/lamports.js";
import { BalanceReader, Signer } from "../../wallet/index.js";
import { InsufficientFunds } from "../domain/errors.js";

/** Base fee for a single-signature transaction. Priority fees are out of scope here. */
const BASE_FEE_LAMPORTS = 5000n;

/** @typedef {InsufficientFunds | import("../../shared/domain/errors.js").RpcError | import("../../wallet/index.js").SignerUnavailable} ResolveError */
/** @typedef {import("../../wallet/index.js").SignerShape | import("../../wallet/index.js").BalanceReaderShape} ResolveContext */

/**
 * Turn tool input into a request: resolve the sender and check funds up front so the failure is
 * a domain error, not an executor error after signing.
 * @param {import("../domain/types.js").TransferSolInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").TransferSolRequest, ResolveError, ResolveContext>}
 */
export const resolveRequest = (input) =>
  Effect.gen(function* () {
    const from = yield* (yield* Signer).address();
    const lamports = solToLamports(input.amountSol);
    const available = yield* (yield* BalanceReader).getLamports(from);
    const required = lamports + BASE_FEE_LAMPORTS;
    if (available < required) {
      return yield* new InsufficientFunds({
        owner: from,
        required: required.toString(),
        available: available.toString(),
      });
    }
    return { from, to: input.to, lamports, skipSimulation: input.skipSimulation };
  });
