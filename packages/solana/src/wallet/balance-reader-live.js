// @ts-check
import { address } from "@solana/kit";
import { BalanceReader } from "@solos/core";
import { Effect, Layer } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import {
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  decodeMintDecimals,
  decodeTokenAccounts,
  toTokenBalances,
} from "./parse-token-accounts.js";

/**
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {string} owner
 * @param {string} programId
 */
const rawTokenAccounts = (ctx, owner, programId) =>
  rpcCall("getTokenAccountsByOwner", ctx.url, () =>
    ctx.rpc
      .getTokenAccountsByOwner(
        address(owner),
        { programId: address(programId) },
        { encoding: "base64" },
      )
      .send(),
  ).pipe(Effect.map((result) => decodeTokenAccounts(result.value)));

/**
 * Decimals live on the mint, so one batched fetch per distinct mint.
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {ReadonlyArray<string>} mints
 * @returns {Effect.Effect<Map<string, number>, import("@solos/core").RpcError>}
 */
const decimalsFor = (ctx, mints) => {
  if (mints.length === 0) return Effect.succeed(new Map());
  return rpcCall("getMultipleAccounts", ctx.url, () =>
    ctx.rpc
      .getMultipleAccounts(
        mints.map((m) => address(m)),
        { encoding: "base64" },
      )
      .send(),
  ).pipe(
    Effect.map(
      (result) =>
        new Map(
          result.value.flatMap((account, i) =>
            account === null ? [] : [[mints[i] ?? "", decodeMintDecimals(account.data[0])]],
          ),
        ),
    ),
  );
};

/**
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {string} owner
 */
const tokenBalances = (ctx, owner) =>
  Effect.gen(function* () {
    const [legacy, modern] = yield* Effect.all(
      [
        rawTokenAccounts(ctx, owner, TOKEN_PROGRAM),
        rawTokenAccounts(ctx, owner, TOKEN_2022_PROGRAM),
      ],
      { concurrency: 2 },
    );
    const mints = [...new Set([...legacy, ...modern].map((a) => a.mint))];
    const decimals = yield* decimalsFor(ctx, mints);
    return [
      ...toTokenBalances("token", legacy, decimals),
      ...toTokenBalances("token-2022", modern, decimals),
    ];
  });

export const BalanceReaderLive = Layer.effect(
  BalanceReader,
  Effect.map(SolanaRpc, (ctx) => ({
    getLamports: (owner) =>
      rpcCall("getBalance", ctx.url, () => ctx.rpc.getBalance(address(owner)).send()).pipe(
        Effect.map((result) => BigInt(result.value)),
      ),
    getTokenBalances: (owner) => tokenBalances(ctx, owner),
  })),
);
