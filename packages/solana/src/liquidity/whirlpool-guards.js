// @ts-check
/**
 * The on-chain state guards shared by the deposit and withdraw plans: the position row, the
 * pool row, and the two mint rows. Every guard answers one question — is this account
 * present, program-owned, and laid out as the pinned IDL says — so a plan can reject before
 * any instruction exists. Guard failures carry fixed plain-text reasons; the executor turns
 * them into `BuildRejected` (ADR-0022).
 */
import { decodePosition, decodeWhirlpool } from "./whirlpool-decode.js";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";
import { TOKEN_PROGRAM } from "./whirlpool-withdraw-instruction.js";

/** @typedef {{ readonly owner: string; readonly bytes: Uint8Array }} FetchedRow */

/** Tick spacings the pinned program mints pools with; anything else is corrupt state. */
export const TICK_SPACINGS = new Set([1, 8, 16, 32, 64, 128, 256]);

/** @param {string} reason @returns {{ readonly status: "reject"; readonly reason: string }} */
export const reject = (reason) => ({ status: "reject", reason });

/** A guarded position row. @typedef {{ readonly layout: { readonly whirlpool: string; readonly positionMint: string; readonly liquidity: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number } }} GuardedPosition */

/** A guarded pool row. @typedef {{ readonly layout: { readonly sqrtPrice: bigint; readonly tokenMintA: string; readonly tokenMintB: string; readonly tickSpacing: number; readonly tokenVaultA: string; readonly tokenVaultB: string } }} GuardedPool */

/**
 * Guard the position row: present, program-owned, and decodable. Callers cross-check pool
 * identity and PDA derivation themselves — a deposit compares against its pool argument, a
 * removal derives from the position's own mint.
 * @param {FetchedRow | null | undefined} row @returns {GuardedPosition | { readonly status: "reject"; readonly reason: string }}
 */
export const guardPosition = (row) => {
  if (row === null || row === undefined) return reject("no account at the position address");
  if (row.owner !== WHIRLPOOL_PROGRAM) {
    return reject("position account is not owned by the pinned Whirlpool program");
  }
  const guarded = decodePosition(row.bytes);
  if (guarded.status === "corrupt") {
    return reject(`position account has the wrong layout: ${guarded.reason}`);
  }
  return { layout: guarded.layout };
};

/**
 * Guard the pool row: present, program-owned, decodable, with a real tick spacing (zero
 * would panic the pinned tick-array math instead of failing typed).
 * @param {FetchedRow | null | undefined} row @returns {GuardedPool | { readonly status: "reject"; readonly reason: string }}
 */
export const guardPool = (row) => {
  if (row === null || row === undefined) return reject("the position's pool is missing");
  if (row.owner !== WHIRLPOOL_PROGRAM) {
    return reject("the position's pool is not owned by the pinned Whirlpool program");
  }
  const guarded = decodeWhirlpool(row.bytes);
  if (guarded.status === "corrupt") {
    return reject(`the position's pool has the wrong layout: ${guarded.reason}`);
  }
  if (!TICK_SPACINGS.has(guarded.layout.tickSpacing)) {
    return reject(`pool tick spacing ${guarded.layout.tickSpacing} is not a supported value`);
  }
  return { layout: guarded.layout };
};

/**
 * Guard the two mint rows: present and classic-SPL, so the fixed token program and the
 * quote math apply; token-2022 venues (including transfer-fee mints) are rejected.
 * @param {FetchedRow | null | undefined} a @param {FetchedRow | null | undefined} b @returns {{ readonly status: "reject"; readonly reason: string } | null}
 */
export const guardMints = (a, b) => {
  if (a === null || a === undefined) return reject("token A mint is missing");
  if (b === null || b === undefined) return reject("token B mint is missing");
  if (a.owner !== TOKEN_PROGRAM) {
    return reject("token A mint is not a classic SPL token mint; token-2022 is rejected");
  }
  if (b.owner !== TOKEN_PROGRAM) {
    return reject("token B mint is not a classic SPL token mint; token-2022 is rejected");
  }
  return null;
};
