// @ts-check
/**
 * The token accounts a liquidity build touches, and the idempotent creates it may prepend.
 *
 * Both directions do the same thing here: read the owner's A and B accounts once, then decide
 * per side whether it is fine, needs creating, or is a typed refusal. Only that per-side rule
 * differs — a deposit asks whether the side can pay, a withdrawal whether it can receive — so
 * the fetch and the assembly live here once and each builder passes its own rule.
 */
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getTokenDecoder,
} from "@solana-program/token";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("../liquidity/liquidity-accounts.js").FetchedAccount} FetchedAccount */
/** @typedef {Parameters<typeof import("@solana/kit").appendTransactionMessageInstructions>[0][number]} SetupInstruction */

const tokenDecoder = getTokenDecoder();

/** The bounded read shape the liquidity helpers take. @param {Rpc} ctx */
export const liquidityRead = (ctx) => ({
  rpc: ctx.rpc,
  origin: rpcOrigin(ctx.url),
  timeoutMs: TOKEN_RPC_TIMEOUT_MS,
});

/** @param {string} reason @returns {import("effect").Effect.Effect<never, BuildRejected>} */
export const fail = (reason) => Effect.fail(new BuildRejected({ reason }));

/** @param {string} value */
const asAddress = (value) =>
  /** @type {import("@solana/kit").Address} */ (/** @type {unknown} */ (value));

/**
 * An idempotent create of the signer's own ATA. Rent is the signer's, and the instruction is a
 * no-op when the account already exists. `program` names the mint's own token program, which
 * matters for a Token-2022 mint: the classic program would reject the account it derives.
 * @param {Kit} kit @param {string} mint @param {{ ata: string; program?: string }} target
 */
export const createAta = (kit, mint, { ata, program }) =>
  getCreateAssociatedTokenIdempotentInstruction({
    payer: kit.signer,
    ata: asAddress(ata),
    owner: asAddress(kit.signer.address),
    mint: asAddress(mint),
    ...(program !== undefined && { tokenProgram: asAddress(program) }),
  });

/**
 * One funding side of a spend: nothing to do when it already covers the quote, an idempotent
 * create when the quote needs nothing from it, and a typed refusal when it is short or absent
 * but needed — a spend from an account that cannot cover it is not simulable honestly.
 * `covered` is what a wrap in this same transaction will add before the spend, so a side funded
 * by wrapping native SOL is not refused for a balance it is about to have.
 * @param {{ kit: Kit; row: FetchedAccount | null | undefined; required: bigint; mint: string;
 *   ata: string; program?: string; label: "A" | "B"; verb: string; covered?: bigint }} side
 * @returns {import("effect").Effect.Effect<SetupInstruction | null, BuildRejected>}
 */
export const fundingSide = ({ kit, row, required, mint, ata, program, label, verb, covered }) => {
  const balance = row === null || row === undefined ? null : tokenDecoder.decode(row.bytes).amount;
  // A wrap in this same transaction creates the account too, so an absent side it covers is
  // already funded by the time the spend runs.
  if ((balance ?? 0n) + (covered ?? 0n) >= required) return Effect.succeed(null);
  if (required > 0n) {
    const detail =
      balance === null
        ? "the funding account does not exist"
        : `${balance} available, the ${verb} needs ${required}`;
    return fail(`insufficient token ${label} balance: ${detail}`);
  }
  return Effect.succeed(createAta(kit, mint, { ata, program }));
};

/**
 * One receiving side of a payout: it only has to exist. A side owed nothing is created so the
 * instruction's account is there; a side that is owed something and absent is a refusal.
 * @param {{ kit: Kit; row: FetchedAccount | null | undefined; owed: bigint; mint: string;
 *   ata: string; program?: string; label: "A" | "B" }} side
 * @returns {import("effect").Effect.Effect<SetupInstruction | null, BuildRejected>}
 */
export const receivingSide = ({ kit, row, owed, mint, ata, program, label }) => {
  if (row !== null && row !== undefined) return Effect.succeed(null);
  if (owed > 0n) {
    return fail(
      `the token ${label} receiving account does not exist and the position owes it ` +
        `${owed} base units at the current price`,
    );
  }
  return Effect.succeed(createAta(kit, mint, { ata, program }));
};

/**
 * Read both owner token accounts and apply one per-side rule, keeping whatever creates it asked
 * for. The order is A then B, which is the order the instruction's accounts are in.
 * @param {ReturnType<typeof liquidityRead>} read
 * @param {{ tokenOwnerAccountA: string; tokenOwnerAccountB: string }} accounts
 * @param {(side: { row: FetchedAccount | null | undefined; label: "A" | "B" }) =>
 *   import("effect").Effect.Effect<SetupInstruction | null, BuildRejected>} sideFor
 * @returns {import("effect").Effect.Effect<SetupInstruction[], BuildRejected | import("@solos/core").RpcError>}
 */
export const setupSides = (read, accounts, sideFor) =>
  Effect.flatMap(
    fetchAccounts(read, [accounts.tokenOwnerAccountA, accounts.tokenOwnerAccountB]),
    ([a, b]) =>
      Effect.gen(function* () {
        const first = yield* sideFor({ row: a, label: "A" });
        const second = yield* sideFor({ row: b, label: "B" });
        return [first, second].filter((setup) => setup !== null);
      }),
  );
