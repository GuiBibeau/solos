// @ts-check
/** Read-only network identity and submission recovery evidence. */
import { Args, Command } from "@effect/cli";
import { SolanaRpc } from "@solos/solana";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const clusters = new Map([
  ["5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", "mainnet"],
  ["EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "devnet"],
  ["4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY", "testnet"],
]);

/** @param {import("effect").Context.Tag.Service<typeof SolanaRpc>} ctx */
export const inspectNetwork = (ctx) =>
  Effect.tryPromise({
    try: async () => {
      const [genesisHash, slot] = await Promise.all([
        ctx.rpc.getGenesisHash().send(),
        ctx.rpc.getSlot({ commitment: "finalized" }).send(),
      ]);
      return {
        cluster: clusters.get(genesisHash) ?? "unknown",
        genesisHash,
        finalizedSlot: slot.toString(),
      };
    },
    catch: () => new Error("network inspection failed on the configured RPC"),
  });

/** Null means unknown, never proof that a send failed. The lifetime is a fresh upper bound
 * for an earlier recent-blockhash send on this RPC, not that send's exact expiry height.
 * @param {import("effect").Context.Tag.Service<typeof SolanaRpc>} ctx @param {string} signature */
export const inspectSignature = (ctx, signature) =>
  Effect.tryPromise({
    try: async () => {
      if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature))
        throw new Error("expected a base58 transaction signature");
      const [statuses, height, lifetime] = await Promise.all([
        ctx.rpc
          .getSignatureStatuses([/** @type {any} */ (signature)], {
            searchTransactionHistory: true,
          })
          .send(),
        ctx.rpc.getBlockHeight({ commitment: "finalized" }).send(),
        ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
      ]);
      const row = statuses.value[0];
      return {
        signature,
        found: Boolean(row),
        confirmationStatus: row?.confirmationStatus ?? null,
        slot: row?.slot.toString() ?? null,
        error: row?.err ?? null,
        finalizedBlockHeight: height.toString(),
        freshLastValidBlockHeight: lifetime.value.lastValidBlockHeight.toString(),
      };
    },
    catch: () => new Error("signature inspection failed on the configured RPC"),
  });

export const network = Command.make("network", {}, () =>
  withSolos(
    Effect.flatMap(SolanaRpc, (ctx) => inspectNetwork(ctx).pipe(Effect.flatMap(emit))),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription("Read the RPC genesis hash, cluster and finalized slot; never submits"),
);

const signature = Args.text({ name: "signature" });
export const signatureStatus = Command.make("signature", { signature }, (o) =>
  withSolos(
    Effect.flatMap(SolanaRpc, (ctx) =>
      inspectSignature(ctx, o.signature).pipe(Effect.flatMap(emit)),
    ),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Look up a signature in RPC history and finalized progress; never submits",
  ),
);
