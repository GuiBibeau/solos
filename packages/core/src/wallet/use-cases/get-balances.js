// @ts-check
import { Effect } from "effect";
import { lamportsToSol } from "../../shared/domain/lamports.js";
import { BalanceReader } from "../ports/balance-reader.js";
import { Signer } from "../ports/signer.js";

/**
 * SOL and token balances for `owner`, defaulting to the configured signer.
 * @param {import("../../shared/domain/address.js").Address | undefined} owner
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").WalletBalances,
 *   import("../../shared/domain/errors.js").RpcError | import("../domain/errors.js").SignerUnavailable,
 *   import("../ports/balance-reader.js").BalanceReaderShape | import("../ports/signer.js").SignerShape
 * >}
 */
export const getBalances = (owner) =>
  Effect.gen(function* () {
    const reader = yield* BalanceReader;
    const resolvedOwner = owner ?? (yield* (yield* Signer).address());
    const [lamports, tokens] = yield* Effect.all(
      [reader.getLamports(resolvedOwner), reader.getTokenBalances(resolvedOwner)],
      { concurrency: 2 },
    );
    return {
      owner: resolvedOwner,
      lamports: lamports.toString(),
      sol: lamportsToSol(lamports),
      tokens: [...tokens],
    };
  }).pipe(Effect.withSpan("wallet.getBalances"));
