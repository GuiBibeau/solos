// @ts-check
/** @typedef {import("./kamino-rpc-seam.js").KaminoMarketInstance} KaminoMarketInstance */
/** @typedef {import("./kamino-rpc-seam.js").KaminoReserveInstance} KaminoReserveInstance */
/** @typedef {import("./kamino-rpc-seam.js").LedgerInstant} LedgerInstant */
/** @typedef {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} SolanaKitRpc */
import {
  LendingLayoutUnsupported,
  LendingMarketUnavailable,
  LendingResponseInvalid,
  ReserveUnavailable,
} from "@solos/core/lend";
import { RpcError } from "@solos/core/shared";
import { Effect } from "effect";
import {
  KaminoAccountLayoutError,
  KaminoMarketOwnerError,
  sdkLedgerInstant,
  sdkLoadMarket,
  sdkReserveForMint,
  sdkReserveRates,
} from "./kamino-rpc-seam.js";

const TRANSPORT_REASON = "the configured RPC endpoint failed the request";

/**
 * Load the configured market. `KaminoMarket.load` resolves null when the account is missing;
 * a foreign owner or undecodable bytes of an existing account are typed market failures; a
 * refused or failing endpoint is the shared transport error. Fixed reasons only — raw SDK
 * error text never travels out of the adapter.
 * @param {SolanaKitRpc} rpc
 * @param {string} marketAddress
 * @param {string} origin
 * @returns {Effect.Effect<KaminoMarketInstance | null, LendingMarketUnavailable | LendingLayoutUnsupported | RpcError>}
 */
export const loadKaminoMarket = (rpc, marketAddress, origin) =>
  Effect.tryPromise({
    try: () => sdkLoadMarket(rpc, marketAddress),
    catch: (error) => {
      if (error instanceof KaminoMarketOwnerError) {
        return new LendingMarketUnavailable({
          market: marketAddress,
          reason: "the configured market account is not owned by the pinned lending program",
        });
      }
      if (error instanceof KaminoAccountLayoutError) {
        return new LendingLayoutUnsupported({
          reserve: marketAddress,
          reason: "the configured market account could not be decoded under the pinned program",
        });
      }
      return new RpcError({ method: "getAccountInfo", url: origin, reason: TRANSPORT_REASON });
    },
  });

/**
 * The configured market's float-rate reserve for the mint. Absence is typed — the answer is
 * never borrowed from a fixed-rate reserve, another kind, or another market.
 * @param {KaminoMarketInstance} market
 * @param {string} marketAddress
 * @param {string} mint
 * @returns {Effect.Effect<KaminoReserveInstance, ReserveUnavailable>}
 */
export const floatRateReserve = (market, marketAddress, mint) =>
  Effect.suspend(() => {
    const reserve = sdkReserveForMint(market, mint);
    if (reserve === undefined) {
      return Effect.fail(
        new ReserveUnavailable({
          market: marketAddress,
          mint,
          reason: "the configured market has no float-rate reserve for this mint",
        }),
      );
    }
    return Effect.succeed(reserve);
  });

/**
 * The ledger instant the APY math needs: slot and block time together, since the SDK's v12
 * rate methods take the pair, never a bare slot.
 * @param {SolanaKitRpc} rpc
 * @param {string} origin
 * @returns {Effect.Effect<LedgerInstant, RpcError>}
 */
export const ledgerInstant = (rpc, origin) =>
  Effect.tryPromise({
    try: () => sdkLedgerInstant(rpc),
    catch: () => new RpcError({ method: "getSlot", url: origin, reason: TRANSPORT_REASON }),
  });

/**
 * The interest-only APY pair from the reserve's own state math. A state that cannot produce
 * rates is an invalid response, never a zero.
 * @param {KaminoReserveInstance} reserve
 * @param {LedgerInstant} instant
 * @returns {Effect.Effect<{ readonly supplyApy: number; readonly borrowApy: number }, LendingResponseInvalid>}
 */
export const reserveRates = (reserve, instant) =>
  Effect.try({
    try: () => sdkReserveRates(reserve, instant),
    catch: () =>
      new LendingResponseInvalid({ reason: "the reserve state cannot produce interest rates" }),
  });
