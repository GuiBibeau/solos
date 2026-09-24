// @ts-check
import { decodeTrader, PHOENIX_PROGRAM_ADDRESS } from "@ellipsis-labs/rise";
import { address } from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { base64AccountData } from "../market/mint-account.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { traderAddress } from "./perp-onboarder-live.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */

/** Read one confirmed account with bounded binary data; null means it does not yet exist.
 * @param {Rpc} ctx @param {string} key */
export const getCollateralAccount = (ctx, key) =>
  Effect.gen(function* () {
    const { value } = yield* rpcCall("getAccountInfo", ctx.url, () =>
      ctx.rpc.getAccountInfo(address(key), { encoding: "base64", commitment: "confirmed" }).send(),
    );
    if (value === null) return null;
    if (value.data[0].length > 100_000)
      return yield* new BuildRejected({ reason: "Phoenix account is too large" });
    return { owner: value.owner, lamports: value.lamports, bytes: base64AccountData(value.data) };
  });

/** @param {Rpc} ctx @param {string} key @param {string} label */
export const readCollateralAccount = (ctx, key, label) =>
  Effect.gen(function* () {
    const row = yield* getCollateralAccount(ctx, key);
    if (row === null)
      return yield* new BuildRejected({ reason: `Phoenix ${label} account is missing` });
    return row;
  });

/** Enforce on-chain ownership, authority, and default scope before building collateral flows.
 * @param {Rpc} ctx @param {string} owner */
export const readCollateralTrader = (ctx, owner) =>
  Effect.gen(function* () {
    const trader = yield* Effect.tryPromise({
      try: () => traderAddress(owner),
      catch: () => new BuildRejected({ reason: "invalid configured Phoenix trader authority" }),
    });
    const row = yield* readCollateralAccount(ctx, trader, "trader");
    if (row.owner !== PHOENIX_PROGRAM_ADDRESS || row.bytes.length > 65_536)
      return yield* new BuildRejected({
        reason: "Phoenix trader account owner or size is invalid",
      });
    const state = yield* Effect.try({
      try: () => decodeTrader(row.bytes),
      catch: () => new BuildRejected({ reason: "Phoenix trader account cannot be decoded" }),
    });
    if (
      state.authority !== owner ||
      state.key !== trader ||
      state.traderPdaIndex !== 0 ||
      state.traderSubaccountIndex !== 0
    )
      return yield* new BuildRejected({
        reason: "Phoenix trader account is not the current wallet's (0,0) trader",
      });
    return { trader, state, row };
  });
