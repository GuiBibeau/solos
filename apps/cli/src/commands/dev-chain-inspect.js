// @ts-check
/** Read-only on-chain evidence for reconciling confirmed transactions and remaining rent. */
import { Args, Command, Options } from "@effect/cli";
import { SolanaRpc } from "@solos/solana";
import { AddressSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

/** @param {string} value */
const checkedAddress = (value) => {
  if (!AddressSchema.safeParse(value).success) throw new Error("expected a Solana address");
  return value;
};

/** @param {string} value */
const checkedSignature = (value) => {
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value))
    throw new Error("expected a base58 transaction signature");
  return value;
};

/** @param {any} row */
const accountKey = (row) => (typeof row === "string" ? row : row.pubkey);

/** @param {any} tx @param {string} signature */
export const transactionEvidence = (tx, signature) => {
  if (!tx) throw new Error("confirmed transaction unavailable on the configured RPC");
  if (!tx.meta) throw new Error("confirmed transaction has no balance metadata");
  const keys = /** @type {string[]} */ (tx.transaction.message.accountKeys.map(accountKey));
  const loaded = tx.meta.loadedAddresses;
  if (loaded) keys.push(...loaded.writable, ...loaded.readonly);
  if (keys.length !== tx.meta.preBalances.length || keys.length !== tx.meta.postBalances.length)
    throw new Error("transaction balance metadata and accounts do not align");
  const accountDeltas = keys.flatMap((account, index) => {
    const preLamports = BigInt(tx.meta.preBalances[index]);
    const postLamports = BigInt(tx.meta.postBalances[index]);
    if (preLamports === postLamports) return [];
    return [
      {
        account,
        preLamports: preLamports.toString(),
        postLamports: postLamports.toString(),
        deltaLamports: (postLamports - preLamports).toString(),
      },
    ];
  });
  return {
    signature,
    slot: tx.slot.toString(),
    feeLamports: tx.meta.fee.toString(),
    error: tx.meta.err ?? null,
    accountDeltas,
  };
};

/** @param {import("effect").Context.Tag.Service<typeof SolanaRpc>} ctx @param {string} signature */
export const inspectTransaction = (ctx, signature) =>
  Effect.tryPromise({
    try: async () =>
      transactionEvidence(
        await ctx.rpc
          .getTransaction(/** @type {any} */ (checkedSignature(signature)), {
            encoding: "json",
            commitment: "finalized",
            maxSupportedTransactionVersion: 1,
          })
          .send(),
        signature,
      ),
    catch: () => new Error("transaction inspection failed or is unavailable on the configured RPC"),
  });

/** @param {import("effect").Context.Tag.Service<typeof SolanaRpc>} ctx @param {string} account */
export const inspectAccount = (ctx, account) =>
  Effect.tryPromise({
    try: async () => {
      const row = (
        await ctx.rpc
          .getAccountInfo(/** @type {any} */ (checkedAddress(account)), {
            encoding: "base64",
            commitment: "finalized",
          })
          .send()
      ).value;
      if (!row) return { account, exists: false };
      return {
        account,
        exists: true,
        owner: row.owner,
        lamports: row.lamports.toString(),
        dataBytes: Buffer.from(row.data[0], "base64").length,
      };
    },
    catch: () => new Error("account inspection failed on the configured RPC"),
  });

/** Explicitly inspect public raw account bytes for offline protocol fixtures. Default 65 KiB,
 * with a bounded opt-in for the pinned Phoenix asset map (1.6 MiB).
 * @param {import("effect").Context.Tag.Service<typeof SolanaRpc>} ctx @param {string} account @param {number} [maxBytes] */
export const inspectAccountData = (ctx, account, maxBytes = 65_536) =>
  Effect.tryPromise({
    try: async () => {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2_097_152)
        throw new Error("invalid public account data cap");
      const row = (
        await ctx.rpc
          .getAccountInfo(/** @type {any} */ (checkedAddress(account)), {
            encoding: "base64",
            commitment: "finalized",
          })
          .send()
      ).value;
      if (!row) throw new Error("account absent");
      if (Buffer.from(row.data[0], "base64").length > maxBytes)
        throw new Error("account too large for public fixture");
      return { account, owner: row.owner, dataBase64: row.data[0] };
    },
    catch: () => new Error("public account data unavailable or too large on configured RPC"),
  });

const signature = Args.text({ name: "signature" });
const transaction = Command.make("transaction", { signature }, (o) =>
  withSolos(
    Effect.flatMap(SolanaRpc, (ctx) =>
      inspectTransaction(ctx, o.signature).pipe(Effect.flatMap(emit)),
    ),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read confirmed transaction fees and per-account SOL deltas; never submits",
  ),
);

const account = Args.text({ name: "address" });
const accountCommand = Command.make("account", { account }, (o) =>
  withSolos(
    Effect.flatMap(SolanaRpc, (ctx) => inspectAccount(ctx, o.account).pipe(Effect.flatMap(emit))),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read account owner, lamports and data length, or report absence; never submits",
  ),
);

const maxBytes = Options.integer("max-bytes").pipe(
  Options.withDefault(65_536),
  Options.withDescription("Maximum public account bytes to export (default 65536, max 2097152)"),
);
const accountData = Command.make("account-data", { account, maxBytes }, (o) =>
  withSolos(
    Effect.flatMap(SolanaRpc, (ctx) =>
      inspectAccountData(ctx, o.account, o.maxBytes).pipe(Effect.flatMap(emit)),
    ),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Export bounded public account bytes as base64 for offline protocol fixtures; read-only",
  ),
);

export const inspect = Command.make("inspect").pipe(
  Command.withDescription("Read-only chain evidence for QA reconciliation"),
  Command.withSubcommands([transaction, accountCommand, accountData]),
);
