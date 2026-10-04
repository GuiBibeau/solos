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
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { isTokenAccountRow } from "../wallet/parse-token-accounts.js";

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

/** @param {string} reason @param {string} [remedy] @returns {import("effect").Effect.Effect<never, BuildRejected>} */
export const fail = (reason, remedy) =>
  Effect.fail(new BuildRejected(remedy === undefined ? { reason } : { reason, remedy }));

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
 * Whether a side needs nothing added. An account that exists is satisfied once its balance plus
 * any wrap covers the spend. An absent one is satisfied only by a wrap, which creates it as well
 * as funding it — otherwise it must still be created, because the instruction lists it either way.
 * @param {{ isAbsent: boolean; balance: bigint; covered: bigint; required: bigint }} side
 */
const isSatisfied = ({ isAbsent, balance, covered, required }) =>
  isAbsent ? covered > 0n && covered >= required : balance + covered >= required;

/**
 * Anyone can park a system account at a derived ATA with a lamport transfer; decoding it as a
 * token account would throw, so it is refused with a reason instead.
 * @param {"A" | "B"} label
 */
const foreignRow = (label) =>
  fail(
    `the token ${label} funding address holds an account that is not a token account`,
    "the address holds a system account, usually from a stray lamport transfer; move its lamports out first",
  );

/**
 * The side's current balance: zero when absent, decoded when it is a token account, and a typed
 * refusal when something else sits at the address.
 * @param {FetchedAccount | null | undefined} row @param {"A" | "B"} label
 * @returns {bigint | import("effect").Effect.Effect<never, BuildRejected>}
 */
const fundingBalance = (row, label) => {
  if (row === null || row === undefined) return 0n;
  if (!isTokenAccountRow({ owner: row.owner, byteLength: row.bytes.length })) {
    return foreignRow(label);
  }
  return tokenDecoder.decode(row.bytes).amount;
};

/** @param {{ mint: string; label: "A" | "B"; required: bigint; balance: bigint }} short */
const shortRemedy = ({ mint, label, required, balance }) =>
  mint === WSOL_MINT
    ? "pass wrapSol: true to wrap native SOL for this side, or fund the wSOL account first"
    : `fund the token ${label} account with ${required - balance} more base units`;

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
  const isAbsent = row === null || row === undefined;
  const balance = fundingBalance(row, label);
  if (typeof balance !== "bigint") return balance;
  if (isSatisfied({ isAbsent, balance, covered: covered ?? 0n, required })) {
    return Effect.succeed(null);
  }
  if (required > 0n) {
    const detail = isAbsent
      ? "the funding account does not exist"
      : `${balance} available, the ${verb} needs ${required}`;
    return fail(
      `insufficient token ${label} balance: ${detail}`,
      shortRemedy({ mint, label, required, balance }),
    );
  }
  // Absent and owed nothing: the instruction still lists the account, so it has to exist.
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
      `create the token ${label} account first (spl-token create-account)`,
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
