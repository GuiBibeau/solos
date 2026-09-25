// @ts-check
/**
 * The pinned pump.fun program, from the official IDL at the pinned upstream commit. Identity
 * of a curve is established only by the derived PDA address plus this owner plus the layout
 * discriminator — the curve account stores no mint of its own. Layout facts were reconciled
 * against this exact IDL revision, not copied from older doc examples:
 * https://github.com/pump-fun/pump-public-docs/blob/81091419e4457566469d4e2a27f64ed84d42419c/idl/pump.json
 */

/** pump.fun bonding-curve program, the IDL `address` field at the pinned commit. */
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/** Immutable source pin of the IDL the byte layouts and discriminators were verified against. */
export const PUMP_IDL_COMMIT = "81091419e4457566469d4e2a27f64ed84d42419c";

/** 8-byte Anchor discriminator of `account:BondingCurve` (IDL `accounts` entry, pinned commit). */
export const BONDING_CURVE_DISCRIMINATOR = Object.freeze([23, 183, 248, 55, 96, 216, 172, 96]);

/** 8-byte Anchor discriminator of `account:Global` (IDL `accounts` entry, pinned commit). */
export const GLOBAL_DISCRIMINATOR = Object.freeze([167, 232, 232, 177, 200, 108, 114, 127]);

/** PDA seed of the per-mint curve account: ["bonding-curve", mint bytes]. */
export const BONDING_CURVE_SEED = "bonding-curve";

/** PDA seed of the shared protocol config: ["global"] — well-known address 4wTV…xnjf. */
export const GLOBAL_SEED = "global";

/** 8-byte Anchor discriminator of `account:FeeConfig` in the fee program's IDL, pinned commit. */
export const FEE_CONFIG_DISCRIMINATOR = Object.freeze([143, 52, 146, 187, 219, 123, 76, 155]);
