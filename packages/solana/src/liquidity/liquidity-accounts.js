// @ts-check
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
import { address } from "@solana/kit";
import { Effect } from "effect";
import { base64AccountData } from "../market/mint-account.js";
import { rpcCall } from "../rpc/rpc-call.js";
import {
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  decodeTokenAccounts,
} from "../wallet/parse-token-accounts.js";

/** One fetched program account: owning program plus raw bytes. @typedef {{ readonly owner: string; readonly bytes: Uint8Array }} FetchedAccount */

/** Hard bound on one batched read, the RPC-standard account-data limit (ADR-0018). */
export const BATCH_CHUNK = 100;

/** @template T @param {readonly T[]} items @param {number} size @returns {T[][]} consecutive chunks */
export const chunksOf = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** @param {AccountRead} read */
const deadline = (read) => AbortSignal.timeout(read.timeoutMs);

/**
 * One batched account fetch (at most `BATCH_CHUNK` addresses). Absent accounts arrive as
 * null entries in order; transport failures are the shared `RpcError`.
 * @param {AccountRead} read
 * @param {readonly string[]} accounts
 * @returns {Effect.Effect<ReadonlyArray<FetchedAccount | null>, import("@solos/core").RpcError>}
 */
export const fetchAccounts = (read, accounts) =>
  rpcCall("getMultipleAccounts", read.origin, () =>
    read.rpc
      .getMultipleAccounts(
        accounts.map((a) => address(a)),
        { encoding: "base64" },
      )
      .send({ abortSignal: deadline(read) }),
  ).pipe(
    Effect.map((result) =>
      result.value.map((account) =>
        account === null ? null : { owner: account.owner, bytes: base64AccountData(account.data) },
      ),
    ),
  );

/**
 * Token accounts of one owner, decoded by the token program's own codec. The `mint` filter
 * covers both token programs in one call (custody proof); the `programId` filter enumerates
 * one program at a time (owner scanning — positions may be either program).
 * @param {AccountRead} read
 * @param {string} owner
 * @param {{ mint?: string; programId?: string }} filter
 */
const tokenAccounts = (read, owner, filter) =>
  rpcCall("getTokenAccountsByOwner", read.origin, () =>
    read.rpc
      .getTokenAccountsByOwner(
        address(owner),
        filter.mint
          ? { mint: address(filter.mint) }
          : { programId: address(/** @type {string} */ (filter.programId)) },
        { encoding: "base64" },
      )
      .send({ abortSignal: deadline(read) }),
  ).pipe(Effect.map((result) => decodeTokenAccounts(result.value)));

/**
 * Custody proof for one position NFT: the owner holds the mint exactly once with amount 1.
 * @param {AccountRead} read
 * @param {string} owner
 * @param {string} mint
 * @returns {Effect.Effect<boolean, import("@solos/core").RpcError>}
 */
export const holdsPositionNft = (read, owner, mint) =>
  Effect.map(
    tokenAccounts(read, owner, { mint }),
    (rows) => rows.filter((row) => row.amount === 1n).length === 1,
  );

/**
 * Every token account of one owner across both token programs.
 * @param {AccountRead} read
 * @param {string} owner
 * @returns {Effect.Effect<ReadonlyArray<ReturnType<typeof decodeTokenAccounts>[number]>, import("@solos/core").RpcError>}
 */
export const ownedTokenAccounts = (read, owner) =>
  Effect.all(
    [
      tokenAccounts(read, owner, { programId: TOKEN_PROGRAM }),
      tokenAccounts(read, owner, { programId: TOKEN_2022_PROGRAM }),
    ],
    { concurrency: 2 },
  ).pipe(Effect.map(([legacy, modern]) => [...legacy, ...modern]));
