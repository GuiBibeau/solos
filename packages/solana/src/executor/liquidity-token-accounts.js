// @ts-check
/**
 * The token accounts a liquidity build touches, and the idempotent creates it may prepend.
 *
 * Both directions do the same thing here: read the owner's A and B accounts once, then decide
 * per side whether it is fine, needs creating, or is a typed refusal. Only that per-side rule
 * differs — a deposit asks whether the side can pay, a withdrawal whether it can receive — so
 * the fetch and the assembly live here once and each builder passes its own rule.
 */
import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("../liquidity/liquidity-accounts.js").FetchedAccount} FetchedAccount */
/** @typedef {Parameters<typeof import("@solana/kit").appendTransactionMessageInstructions>[0][number]} SetupInstruction */

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
