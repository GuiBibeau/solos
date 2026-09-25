// @ts-check
/**
 * Seeds one running Surfnet with the Whirlpool fixture family, all synthetic and offline:
 * raw accounts written through the `surfnet_setAccount` cheatcode, bytes built by
 * `whirlpool-fixture.js` from the pinned IDL layout. The Whirlpool program itself is never
 * invoked — the reader only decodes accounts — so fixtures are safe under the pinned
 * program owner. Every position lives at its position-mint's derived PDA, so seeds and
 * reads can never drift. Corrupt variants (wrong discriminator, truncated bytes, foreign
 * account owner, missing pool or mints) are expressible through the seed options.
 */
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { mintBytes, nftBytes, randomAddress, tokenBytes } from "./liquidity-token-fixture.js";
import { positionAddress } from "./whirlpool-decode.js";
import { addressBytes, base16, positionBytes, whirlpoolBytes } from "./whirlpool-fixture.js";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RENT_LAMPORTS = 1_461_600;

/** @param {string} rpcUrl */
export const accountWriter =
  (rpcUrl) =>
  /**
   * @param {string} account
   * @param {string} owner
   * @param {Uint8Array} data
   */
  (account, owner, data) =>
    jsonRpc(rpcUrl, "surfnet_setAccount", [
      account,
      { lamports: RENT_LAMPORTS, data: base16(data), owner, executable: false },
    ]);

/** Corrupt-account overrides, applied only when they would change a valid fixture. @param {{ discriminator?: Uint8Array<ArrayBuffer>; bytes?: number }} o @returns {{ discriminator?: Uint8Array<ArrayBuffer>; bytes?: number }} */
const corruptOverrides = (o) => ({
  ...(o.discriminator !== undefined && { discriminator: o.discriminator }),
  ...(o.bytes !== 0 && { bytes: o.bytes }),
});

const POOL_DEFAULTS = { decimalsA: 6, decimalsB: 9, bytes: 0, mints: true };

/** @param {string} owner @param {string} mint @returns {Promise<string>} the owner's classic ATA of mint */
export const ataAddress = async (owner, mint) =>
  (
    await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(mint),
      tokenProgram: address(TOKEN_PROGRAM),
    })
  )[0];

/**
 * Seed one Whirlpool pool with its two mints. `mints: false` skips the mint accounts — the
 * pool-mint-missing corrupt case; `discriminator`/`bytes` corrupt the pool account itself.
 * @param {string} rpcUrl
 * @param {{ sqrtPrice?: bigint; decimalsA?: number; decimalsB?: number; discriminator?: Uint8Array<ArrayBuffer>; bytes?: number; mints?: boolean; corruptMint?: "wrong-owner" | "short" }} [options]
 * @returns {Promise<{ pool: string; mintA: string; mintB: string; vaultA: string; vaultB: string }>}
 */
export const seedWhirlpool = async (rpcUrl, options = {}) => {
  const o = { ...POOL_DEFAULTS, ...options };
  const pool = randomAddress();
  const mintA = randomAddress();
  const mintB = randomAddress();
  const vaultA = randomAddress();
  const vaultB = randomAddress();
  const write = accountWriter(rpcUrl);
  if (o.mints) {
    // corruptMint variants: a mint under the System Program, or an undersized mint body.
    const mintOwner = o.corruptMint === "wrong-owner" ? SYSTEM_PROGRAM : TOKEN_PROGRAM;
    const mintData = (/** @type {number} */ decimals) =>
      o.corruptMint === "short" ? mintBytes(decimals).slice(0, 40) : mintBytes(decimals);
    await Promise.all([
      write(mintA, mintOwner, mintData(o.decimalsA)),
      write(mintB, mintOwner, mintData(o.decimalsB)),
      // The pool's two vaults: real empty classic token accounts owned by the pool, so a
      // deposit build can read them and a fork with the program can CPI into them.
      write(vaultA, TOKEN_PROGRAM, tokenBytes(pool, mintA, 0n)),
      write(vaultB, TOKEN_PROGRAM, tokenBytes(pool, mintB, 0n)),
    ]);
  }
  await write(
    pool,
    WHIRLPOOL_PROGRAM,
    whirlpoolBytes({
      tokenMintA: addressBytes(mintA),
      tokenMintB: addressBytes(mintB),
      tokenVaultA: addressBytes(vaultA),
      tokenVaultB: addressBytes(vaultB),
      ...(o.sqrtPrice !== undefined && { sqrtPrice: o.sqrtPrice }),
      ...corruptOverrides(o),
    }),
  );
  return { pool, mintA, mintB, vaultA, vaultB };
};

/** Position seed defaults: an empty position across ticks -1000..1000, program-owned. */
const POSITION_DEFAULTS = {
  liquidity: 0n,
  tickLowerIndex: -1000,
  tickUpperIndex: 1000,
  accountOwner: WHIRLPOOL_PROGRAM,
};

/**
 * Seed one Whirlpool position at its derived PDA, optionally with the position NFT in a
 * plain SPL token account of `owner` (the custody proof). `accountOwner`, `discriminator`
 * and `bytes` build the impostor/corrupt variants; a pool address that was never seeded is
 * the pool-missing case.
 * @param {string} rpcUrl
 * @param {{
 *   pool: string;
 *   owner?: string;
 *   liquidity?: bigint;
 *   tickLowerIndex?: number;
 *   tickUpperIndex?: number;
 *   discriminator?: Uint8Array<ArrayBuffer>;
 *   bytes?: number;
 *   accountOwner?: string;
 * }} options
 * @returns {Promise<{ position: string; positionMint: string }>}
 */
export const seedWhirlpoolPosition = async (rpcUrl, options) => {
  const o = { ...POSITION_DEFAULTS, ...options };
  const write = accountWriter(rpcUrl);
  const positionMint = randomAddress();
  if (o.owner !== undefined) {
    // Custody rides in the owner's ATA of the position mint — the same account the
    // deposit instruction passes as position_token_account.
    const ata = await ataAddress(o.owner, positionMint);
    await write(ata, TOKEN_PROGRAM, nftBytes(o.owner, positionMint));
  }
  const position = await positionAddress(positionMint);
  await write(
    position,
    o.accountOwner,
    positionBytes({
      whirlpool: addressBytes(o.pool),
      positionMint: addressBytes(positionMint),
      liquidity: o.liquidity,
      tickLowerIndex: o.tickLowerIndex,
      tickUpperIndex: o.tickUpperIndex,
      ...corruptOverrides(o),
    }),
  );
  return { position, positionMint };
};

/** @param {string} rpcUrl @param {string} account */
export const resetAccount = (rpcUrl, account) => jsonRpc(rpcUrl, "surfnet_resetAccount", [account]);

export { seedTokenAccounts, randomAddress } from "./liquidity-token-fixture.js";
export { SQRT_PRICE_ONE } from "./whirlpool-fixture.js";
