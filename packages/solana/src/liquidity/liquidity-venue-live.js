// @ts-check
import { LiquidityVenue } from "@solos/core";
import { Effect, Layer } from "effect";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { listPositionsLive } from "./liquidity-enumerate.js";
import { getPositionLive } from "./liquidity-read.js";

/**
 * Live `LiquidityVenue` over the shared `SolanaRpc` service: one configured endpoint, the
 * same one every other Solana tool uses. Reads need no credential and there is no config
 * parameter, so the layer is always constructible — the tool stays advertised and only an
 * individual read can fail. Every flow re-gates the protocol defensively first.
 */
export const LiquidityVenueLive = Layer.effect(
  LiquidityVenue,
  Effect.map(SolanaRpc, (ctx) => {
    /** @type {import("../market/account-read.js").AccountRead} */
    const read = {
      rpc: ctx.rpc,
      origin: rpcOrigin(ctx.url),
      timeoutMs: TOKEN_RPC_TIMEOUT_MS,
    };
    return {
      getPosition: (request) => getPositionLive(read, request),
      listPositions: (request) => listPositionsLive(read, request),
    };
  }),
);
