// @ts-check
/** @typedef {import("./kamino-rpc-seam.js").KaminoMarketInstance} KaminoMarketInstance */
/** @typedef {import("./kamino-rpc-seam.js").KaminoReserveInstance} KaminoReserveInstance */
/** @typedef {import("./kamino-rpc-seam.js").LedgerInstant} LedgerInstant */
import {
  LendingEnumerationIncomplete,
  LendingLayoutUnsupported,
  LendingObligationInvalid,
} from "@solos/core/lend";
import { RpcError } from "@solos/core/shared";
import { Effect } from "effect";
import {
  KaminoObligationLayoutError,
  KaminoPositionReserveError,
  KaminoScanBoundError,
  sdkOwnerObligations,
  sdkPositionReserve,
  sdkPositionReserves,
} from "./kamino-position-sdk.js";

const TRANSPORT_REASON = "the configured RPC endpoint failed the obligation scan";

/**
 * One complete program-account response. Corrupt matching bytes are typed separately from
 * endpoint failures, and no SDK/provider message escapes.
 * @param {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} rpc
 * @param {{ market: string; owner: string; origin: string }} input
 */
export const ownerObligations = (rpc, input) =>
  Effect.tryPromise({
    try: () => sdkOwnerObligations(rpc, input.market, input.owner),
    catch: (error) => {
      if (error instanceof KaminoScanBoundError) {
        return new LendingEnumerationIncomplete({
          reason: "Kamino obligation scan exceeded 4096 accounts",
        });
      }
      return error instanceof KaminoObligationLayoutError
        ? new LendingObligationInvalid({
            obligation: error.account,
            reason: "the obligation account has an unsupported or inconsistent layout",
          })
        : new RpcError({
            method: "getProgramAccounts",
            url: input.origin,
            reason: TRANSPORT_REASON,
          });
    },
  });

/** @param {KaminoReserveInstance} reserve @param {LedgerInstant} instant @param {number} referralFeeBps */
export const positionReserve = (reserve, instant, referralFeeBps) =>
  Effect.try({
    try: () => sdkPositionReserve(reserve, instant, referralFeeBps),
    catch: () =>
      new LendingLayoutUnsupported({
        reserve: reserve.address.toString(),
        reason: "the reserve cannot produce exact collateral supply quantities",
      }),
  });

/** @param {{ rpc: any; market: KaminoMarketInstance; instant: LedgerInstant; origin: string }} input */
export const positionReserves = (input) =>
  Effect.tryPromise({
    try: () => sdkPositionReserves(input.rpc, input.market),
    catch: (error) => {
      if (error instanceof KaminoScanBoundError) {
        return new LendingEnumerationIncomplete({
          reason: "Kamino reserve scan exceeded 4096 accounts",
        });
      }
      return error instanceof KaminoPositionReserveError
        ? new LendingLayoutUnsupported({
            reserve: error.account,
            reason: "a reserve account has an unsupported layout",
          })
        : new RpcError({
            method: "getProgramAccounts",
            url: input.origin,
            reason: TRANSPORT_REASON,
          });
    },
  }).pipe(
    Effect.flatMap((reserves) =>
      Effect.forEach(
        reserves,
        (reserve) => positionReserve(reserve, input.instant, input.market.state.referralFeeBps),
        { concurrency: 1 },
      ),
    ),
  );
