// @ts-check
import { MintDecimals } from "@solos/core/strategy";
import { Effect, Layer } from "effect";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { fetchAccount, TOKEN_RPC_TIMEOUT_MS } from "./account-read.js";
import { base64AccountData, readMintLayout } from "./mint-account.js";

/** The public token schema stops at 18 decimals. Anything wider is not a usable price scale. */
const MAX_DECIMALS = 18;

/** @param {{ readonly owner: string; readonly data: readonly [string, string] } | null} info */
const rawAccountOf = (info) =>
  info === null ? null : { owner: info.owner, data: base64AccountData(info.data) };

/**
 * Decimals from the mint account, or undefined when the account cannot be verified.
 * RPC failures and non-mints are the same refusal: the ledger reserves nothing.
 * @param {import("./account-read.js").AccountRead} read
 * @param {string} mint
 */
const decimalsOf = (read, mint) =>
  Effect.gen(function* () {
    const fetched = yield* fetchAccount(read, mint).pipe(Effect.either);
    if (fetched._tag === "Left") return undefined;
    const layout = readMintLayout(rawAccountOf(fetched.right));
    if (layout.verdict !== "mint") return undefined;
    if (layout.decimals > MAX_DECIMALS) return undefined;
    return layout.decimals;
  });

/**
 * Live mint decimals over the shared Solana RPC. No default scale.
 * @param {{ readonly timeoutMs?: number }} [config]
 */
export const MintDecimalsLive = (config) =>
  Layer.effect(
    MintDecimals,
    Effect.map(SolanaRpc, (ctx) => {
      /** @type {import("./account-read.js").AccountRead} */
      const read = {
        rpc: ctx.rpc,
        origin: rpcOrigin(ctx.url),
        timeoutMs: config?.timeoutMs ?? TOKEN_RPC_TIMEOUT_MS,
      };
      return { decimalsOf: (mint) => decimalsOf(read, mint) };
    }),
  );
