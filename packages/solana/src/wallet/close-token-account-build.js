// @ts-check
/**
 * Closing one token account the signer owns. Its rent returns to the signer, and closing the
 * wrapped-SOL account returns its whole wrapped balance as native SOL: that is the one account
 * that may close while it holds a balance. Everything is read from the account itself, the
 * token program included, and a close the program would refuse is refused here first with the
 * reason. The draft goes through Submission like every other (ADR-0031, ADR-0032).
 */
import { address, getBase64Encoder } from "@solana/kit";
import { getCloseAccountInstruction, getTokenDecoder } from "@solana-program/token";
import { BuildRejected, TRANSFER_PRIORITY_FEE_LAMPORTS } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./parse-token-accounts.js";

/** Room for Token-2022's extension checks; the close itself costs a few thousand units. */
export const CLOSE_ACCOUNT_V1_CONFIG = Object.freeze({
  computeUnitLimit: 20_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: TRANSFER_PRIORITY_FEE_LAMPORTS,
});

const BASE_ACCOUNT_BYTES = 165;
/** Token-2022 writes the account type after the base layout: 2 is a token account, 1 a mint. */
const ACCOUNT_TYPE_ACCOUNT = 2;
const INITIALIZED = 1;
const FROZEN = 2;
const tokenDecoder = getTokenDecoder();
const base64 = getBase64Encoder();

/**
 * @typedef {{
 *   readonly account: string; readonly program: string; readonly lamports: bigint;
 *   readonly mint: string; readonly owner: string; readonly amount: bigint;
 *   readonly isNative: boolean; readonly closeAuthority: string | null; readonly state: number;
 * }} TokenAccountFacts
 */

/** @param {Uint8Array} bytes @param {string} program */
const isTokenAccountLayout = (bytes, program) =>
  bytes.length === BASE_ACCOUNT_BYTES ||
  (program === TOKEN_2022_PROGRAM &&
    bytes.length > BASE_ACCOUNT_BYTES &&
    bytes[BASE_ACCOUNT_BYTES] === ACCOUNT_TYPE_ACCOUNT);

/**
 * @param {string} account @param {{ owner: string; lamports: bigint; data: readonly [string, string] }} row
 * @returns {{ ok: true; facts: TokenAccountFacts } | { ok: false; reason: string }}
 */
export const tokenAccountFacts = (account, row) => {
  if (row.owner !== TOKEN_PROGRAM && row.owner !== TOKEN_2022_PROGRAM)
    return { ok: false, reason: "the account is not a Token or Token-2022 account" };
  const bytes = new Uint8Array(base64.encode(row.data[0]));
  if (!isTokenAccountLayout(bytes, row.owner))
    return { ok: false, reason: "the account is a token program account but not a token account" };
  const token = tokenDecoder.decode(bytes);
  const closeAuthority =
    token.closeAuthority.__option === "Some" ? token.closeAuthority.value : null;
  return {
    ok: true,
    facts: {
      account,
      program: row.owner,
      lamports: BigInt(row.lamports),
      mint: token.mint,
      owner: token.owner,
      amount: token.amount,
      isNative: token.isNative.__option === "Some",
      closeAuthority,
      state: token.state,
    },
  };
};

/**
 * Why the token program would refuse this close, or undefined when it would not.
 * @param {TokenAccountFacts} facts @param {string} signer
 * @returns {{ reason: string; remedy?: string } | undefined}
 */
export const closeRefusal = (facts, signer) => {
  if (facts.owner !== signer) return { reason: "the signer does not own this token account" };
  if (facts.state === FROZEN) return { reason: "the token account is frozen" };
  if (facts.state !== INITIALIZED) return { reason: "the token account is not initialized" };
  if (facts.closeAuthority !== null && facts.closeAuthority !== signer)
    return { reason: "another account holds this token account's close authority" };
  if (facts.isNative || facts.amount === 0n) return undefined;
  return {
    reason: `the token account still holds ${facts.amount} base units of its mint`,
    remedy: "transfer, swap or withdraw that balance first, then close the empty account",
  };
};

/** @param {TokenAccountFacts} facts @returns {import("@solos/actions").TokenAccountCloseQuote} */
const quoteOf = (facts) => ({
  kind: "token_account_close",
  account: facts.account,
  mint: facts.mint,
  tokenProgram: facts.program,
  returnedLamports: facts.lamports.toString(),
  unwrappedLamports: facts.isNative ? facts.amount.toString() : "0",
});

/**
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape; kit: import("../signer/kit-signer.js").KitSignerShape }} deps
 * @param {import("@solos/actions").CloseTokenAccountAction} action
 */
export const draftTokenAccountClose = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const { value } = yield* rpcCall("getAccountInfo", ctx.url, () =>
      ctx.rpc.getAccountInfo(address(action.account), { encoding: "base64" }).send(),
    );
    if (value === null)
      return yield* new BuildRejected({
        reason: "the token account does not exist; nothing was signed",
      });
    const read = tokenAccountFacts(action.account, value);
    if (!read.ok) return yield* new BuildRejected({ reason: `${read.reason}; nothing was signed` });
    const refusal = closeRefusal(read.facts, kit.signer.address);
    if (refusal !== undefined)
      return yield* new BuildRejected({
        ...refusal,
        reason: `${refusal.reason}; nothing was signed`,
      });
    /** @type {import("../submission/seal-draft.js").Draft} */
    const draft = {
      label: "token account close",
      instructions: [
        getCloseAccountInstruction(
          { account: address(action.account), destination: kit.signer.address, owner: kit.signer },
          { programAddress: address(read.facts.program) },
        ),
      ],
      config: CLOSE_ACCOUNT_V1_CONFIG,
    };
    return { draft, plan: { quote: quoteOf(read.facts) } };
  }).pipe(Effect.withSpan("executor.buildTokenAccountClose"));
