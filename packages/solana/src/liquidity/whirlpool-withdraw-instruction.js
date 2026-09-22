// @ts-check
/**
 * Pure assembly of the pinned Whirlpool `decrease_liquidity` instruction (program 0.9.0, the
 * IDL artifact in `whirlpool-program.js`). The program takes the liquidity to remove plus the
 * two minimum token receipts and enforces `TokenMinExceeded` on chain — so the slippage
 * minimums the caller signed become the protocol-level exit bounds, and any price movement
 * that would pay a side under its minimum aborts the transaction instead of short-changing
 * it. Roles and order here are the IDL's, identical to `increase_liquidity`; the discriminator
 * is the Anchor hash of `global:decrease_liquidity` under the same pinned artifact revision.
 */
import {
  address,
  AccountRole,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU128Encoder,
  getU64Encoder,
  getUtf8Encoder,
} from "@solana/kit";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";

/** The classic SPL Token program: the instruction's fixed `token_program` account. */
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Local v1 policy for one removal transaction: decrease_liquidity crosses ticks and reads
 * tick arrays that already exist from the deposit, but the limit keeps the same real
 * headroom as the deposit tier; the priority fee matches the transfer tier. Enforced before
 * signing, never provider-derived.
 */
export const WHIRLPOOL_V1_CONFIG = Object.freeze({
  computeUnitLimit: 300_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: 1000n,
});

/** 8-byte Anchor discriminator of `global:decrease_liquidity` (pinned IDL artifact). */
export const DECREASE_LIQUIDITY_DISCRIMINATOR = Object.freeze([160, 38, 208, 111, 104, 91, 44, 1]);

/** Resolved account addresses of one removal, in nothing particular. @typedef {{ readonly whirlpool: string; readonly positionAuthority: string; readonly position: string; readonly positionTokenAccount: string; readonly tokenOwnerAccountA: string; readonly tokenOwnerAccountB: string; readonly tokenVaultA: string; readonly tokenVaultB: string; readonly tickArrayLower: string; readonly tickArrayUpper: string }} WithdrawAccounts */

/** Instruction arguments: the liquidity to remove and both minimum receipts, all BigInt. @typedef {{ readonly liquidity: bigint; readonly tokenMinA: bigint; readonly tokenMinB: bigint }} WithdrawArgs */

/**
 * The exact instruction data: discriminator, u128 liquidity, u64 min A, u64 min B.
 * @param {bigint} liquidity @param {bigint} tokenMinA @param {bigint} tokenMinB
 * @returns {Uint8Array}
 */
export const decreaseLiquidityData = (liquidity, tokenMinA, tokenMinB) => {
  const data = new Uint8Array(40);
  data.set(DECREASE_LIQUIDITY_DISCRIMINATOR, 0);
  data.set(getU128Encoder().encode(liquidity), 8);
  data.set(getU64Encoder().encode(tokenMinA), 24);
  data.set(getU64Encoder().encode(tokenMinB), 32);
  return data;
};

/**
 * One `decrease_liquidity` instruction with the pinned IDL account order and roles.
 * @param {WithdrawAccounts} accounts @param {WithdrawArgs} args
 */
export const decreaseLiquidityInstruction = (accounts, args) => ({
  programAddress: address(WHIRLPOOL_PROGRAM),
  accounts: [
    { address: address(accounts.whirlpool), role: AccountRole.WRITABLE },
    { address: address(TOKEN_PROGRAM), role: AccountRole.READONLY },
    { address: address(accounts.positionAuthority), role: AccountRole.WRITABLE_SIGNER },
    { address: address(accounts.position), role: AccountRole.WRITABLE },
    { address: address(accounts.positionTokenAccount), role: AccountRole.READONLY },
    { address: address(accounts.tokenOwnerAccountA), role: AccountRole.WRITABLE },
    { address: address(accounts.tokenOwnerAccountB), role: AccountRole.WRITABLE },
    { address: address(accounts.tokenVaultA), role: AccountRole.WRITABLE },
    { address: address(accounts.tokenVaultB), role: AccountRole.WRITABLE },
    { address: address(accounts.tickArrayLower), role: AccountRole.WRITABLE },
    { address: address(accounts.tickArrayUpper), role: AccountRole.WRITABLE },
  ],
  data: decreaseLiquidityData(args.liquidity, args.tokenMinA, args.tokenMinB),
});

/**
 * The tick array PDA holding one start tick: seeds `tick_array`, the pool, and the start
 * tick index as its decimal string — the official derivation, verified against the SDK.
 * @param {string} whirlpool @param {number} startTickIndex
 * @returns {Promise<string>}
 */
export const tickArrayAddress = (whirlpool, startTickIndex) =>
  getProgramDerivedAddress({
    programAddress: address(WHIRLPOOL_PROGRAM),
    seeds: [
      getUtf8Encoder().encode("tick_array"),
      getAddressEncoder().encode(address(whirlpool)),
      getUtf8Encoder().encode(String(startTickIndex)),
    ],
  }).then(([pda]) => pda);
