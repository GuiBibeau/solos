// @ts-check
/** @typedef {import("@solos/core/lend").LendingError} LendingError */
/** @typedef {import("@solos/core/lend").ReserveSnapshot} ReserveSnapshot */
import { LendingMarketUnavailable, LendingTimeout, LendingVenue } from "@solos/core/lend";
import { Effect, Layer } from "effect";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KAMINO_MAIN_MARKET } from "./kamino-addresses.js";
import {
  floatRateReserve,
  ledgerInstant,
  loadKaminoMarket,
  reserveRates,
  validateReserveLayout,
} from "./kamino-market-reader.js";
import { makePositionReads } from "./kamino-position-live.js";
import { reserveSnapshot } from "./kamino-reserve-snapshot.js";
import { sdkReserveParts } from "./kamino-rpc-seam.js";

/** The whole-read deadline: market load, reserve lookup, ledger instant and rate math. */
const READ_TIMEOUT_MS = 15_000;

/**
 * Everything one reserve read needs. `market` is composition state from validated env
 * (ADR-0019): the default Main Market or `KAMINO_LENDING_MARKET`, never a tool argument.
 * @typedef {{
 *   readonly rpc: import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>;
 *   readonly origin: string;
 *   readonly market: string;
 *   readonly timeoutMs: number;
 * }} LendRead
 */

/**
 * The whole read in protocol order: reserve layout preflight before the SDK's filtered load,
 * configured market, its float-rate reserve for the mint, ledger instant, interest-only rates,
 * then pure snapshot mapping. One bounded attempt; no retries, fallback market or off-chain fetch.
 * @param {LendRead} deps
 * @param {string} mint
 * @returns {Effect.Effect<ReserveSnapshot, LendingError>}
 */
const readReserve = (deps, mint) =>
  Effect.gen(function* () {
    yield* validateReserveLayout(deps.rpc, {
      market: deps.market,
      mint,
      origin: deps.origin,
    });
    const market = yield* loadKaminoMarket(deps.rpc, deps.market, deps.origin);
    if (market === null) {
      return yield* new LendingMarketUnavailable({
        market: deps.market,
        reason: "the configured lending market account is missing on the configured RPC",
      });
    }
    const reserve = yield* floatRateReserve(market, deps.market, mint);
    const instant = yield* ledgerInstant(deps.rpc, deps.origin);
    const rates = yield* reserveRates(reserve, instant);
    const parts = sdkReserveParts(reserve);
    return yield* reserveSnapshot({
      market: deps.market,
      mint,
      reserveAddress: parts.reserveAddress,
      liquidityMint: parts.liquidityMint,
      availableAmount: parts.availableAmount,
      decimals: parts.decimals,
      supplyApy: rates.supplyApy,
      borrowApy: rates.borrowApy,
    });
  }).pipe(
    Effect.timeoutFail({
      duration: deps.timeoutMs,
      onTimeout: () => new LendingTimeout({ timeoutMs: deps.timeoutMs }),
    }),
  );

/**
 * Live `LendingVenue` over the shared `SolanaRpc` service: one configured endpoint, the same
 * one every other Solana tool uses, plus the one configured market. No provider key exists
 * for this slice; there is no off-chain HTTP leg.
 * @param {{ readonly market?: string; readonly timeoutMs?: number }} [config] injectable
 *   market and read deadline, for tests and composition
 */
export const KaminoVenueLive = (config) =>
  Layer.effect(
    LendingVenue,
    Effect.map(SolanaRpc, (ctx) => {
      /** @type {LendRead} */
      const deps = {
        rpc: ctx.rpc,
        origin: rpcOrigin(ctx.url),
        market: config?.market ?? KAMINO_MAIN_MARKET,
        timeoutMs: config?.timeoutMs ?? READ_TIMEOUT_MS,
      };
      return {
        market: deps.market,
        getReserve: (mint) => readReserve(deps, mint),
        ...makePositionReads(deps),
      };
    }),
  );
