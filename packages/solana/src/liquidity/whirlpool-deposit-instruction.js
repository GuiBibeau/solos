// @ts-check
/**
 * Pure assembly of the pinned Whirlpool `increase_liquidity` instruction (program 0.9.0, the
 * IDL artifact in `whirlpool-program.js`). The program takes the liquidity to add plus the
 * two maximum token spends and enforces `TokenMaxExceeded` on chain — so the budgets the
 * caller signed become the protocol-level spend bounds, and any price movement that would
 * push a spend over its budget aborts the transaction instead of overrunning it. Roles and
 * order here are the IDL's; `tickArrayAddress` reproduces the official seed layout
 * (`tick_array`, pool, decimal start-tick string).
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
 * Local v1 policy for one deposit transaction: increase_liquidity crosses ticks and can
 * initialize tick-array entries, so the limit leaves real headroom above the transfer tier;
 * the priority fee matches the transfer tier. Enforced before signing, never provider-derived.
 */
export const DEPOSIT_V1_CONFIG = Object.freeze({
  computeUnitLimit: 300_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: 1000n,
});

/** 8-byte Anchor discriminator of `global:increase_liquidity` (pinned IDL artifact). */
export const INCREASE_LIQUIDITY_DISCRIMINATOR = Object.freeze([
  46, 156, 243, 118, 13, 205, 251, 178,
]);

/** Resolved account addresses of one deposit, in nothing particular. @typedef {{ readonly whirlpool: string; readonly positionAuthority: string; readonly position: string; readonly positionTokenAccount: string; readonly tokenOwnerAccountA: string; readonly tokenOwnerAccountB: string; readonly tokenVaultA: string; readonly tokenVaultB: string; readonly tickArrayLower: string; readonly tickArrayUpper: string }} DepositAccounts */

/** Instruction arguments: the liquidity and both maximum spends, all BigInt. @typedef {{ readonly liquidity: bigint; readonly tokenMaxA: bigint; readonly tokenMaxB: bigint }} DepositArgs */

/**
 * The exact instruction data: discriminator, u128 liquidity, u64 max A, u64 max B.
 * @param {bigint} liquidity @param {bigint} tokenMaxA @param {bigint} tokenMaxB
 * @returns {Uint8Array}
 */
export const increaseLiquidityData = (liquidity, tokenMaxA, tokenMaxB) => {
  const data = new Uint8Array(40);
  data.set(INCREASE_LIQUIDITY_DISCRIMINATOR, 0);
  data.set(getU128Encoder().encode(liquidity), 8);
  data.set(getU64Encoder().encode(tokenMaxA), 24);
  data.set(getU64Encoder().encode(tokenMaxB), 32);
  return data;
};

/**
 * One `increase_liquidity` instruction with the pinned IDL account order and roles.
 * @param {DepositAccounts} accounts @param {DepositArgs} args
 */
export const increaseLiquidityInstruction = (accounts, args) => ({
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
  data: increaseLiquidityData(args.liquidity, args.tokenMaxA, args.tokenMaxB),
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
