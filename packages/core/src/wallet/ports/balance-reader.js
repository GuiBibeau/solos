// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly getLamports: (owner: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<bigint, import("../../shared/domain/errors.js").RpcError>;
 *   readonly getTokenBalances: (owner: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<ReadonlyArray<import("../domain/types.js").TokenBalance>, import("../../shared/domain/errors.js").RpcError>;
 * }} BalanceReaderShape
 */

export const BalanceReader = /** @type {Context.Tag<BalanceReaderShape, BalanceReaderShape>} */ (
  Context.GenericTag("@solos/wallet/BalanceReader")
);
