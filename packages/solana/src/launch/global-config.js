// @ts-check
import { address, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { GLOBAL_DISCRIMINATOR, GLOBAL_SEED, PUMP_PROGRAM } from "./pump-program.js";

const utf8 = getUtf8Encoder();

/** `initial_real_token_reserves` sits in the stable original Global prefix: bytes 89..97. */
const INITIAL_REAL_TOKEN_OFFSET = 89;
/**
 * A trade also needs an authorized fee account and the live fee rates. These are read, never
 * assumed: the pinned documentation states `fee_basis_points == 100`, and the live account reads
 * 95 with a separate 5 bps creator fee. A hardcoded 100 would misprice every quote.
 *
 * The recipient comes from `reserved_fee_recipients[0]` (offset 516). Global carries three
 * different fee-recipient fields and the v2 instructions accept only that array. Both other
 * candidates were tried against mainnet on 2026-09-25 and both aborted the transaction with
 * `NotAuthorized` (6000) from `fee_recipient.rs`: the scalar `fee_recipient` (offset 41) and
 * `fee_recipients[0]` (offset 162), which are themselves different keys. A real on-chain
 * `sell_v2` on the same curve passes `reserved_fee_recipients[1]`, so membership in that array
 * is what the program authorizes, and index 0 is an arbitrary member of it. "Reserved" names
 * the field, not its status — it is the live set.
 */
const FEE_RECIPIENTS_START = 516;
const FEE_RECIPIENTS_END = 548;
/** `buyback_fee_recipients` is an 8-entry array; the whole struct is 1087 bytes, which the live account matches exactly. */
const BUYBACK_RECIPIENTS_START = 741;
const BUYBACK_RECIPIENTS_END = 773;
const FEE_BASIS_POINTS_OFFSET = 105;
const CREATOR_FEE_BASIS_POINTS_OFFSET = 154;
/**
 * Minimum Global length solOS reads, unchanged: the curve read needs only the stable prefix.
 * The fee fields sit past it and come back undefined on a shorter account rather than making
 * one corrupt — raising this bound would refuse accounts the read tool accepts today.
 */
const GLOBAL_MIN_BYTES = 97;
const FEE_FIELDS_MIN_BYTES = FEE_RECIPIENTS_END;
const BUYBACK_MIN_BYTES = 773;

/** Outcome of decoding the Global config account. @typedef {{ readonly status: "decoded"; readonly initialRealTokenReserves: bigint; readonly feeRecipient: Uint8Array | undefined; readonly feeBasisPoints: bigint | undefined; readonly creatorFeeBasisPoints: bigint | undefined; readonly buybackFeeRecipient: Uint8Array | undefined } | { readonly status: "corrupt"; readonly reason: string }} GlobalConfigRead */

/**
 * Global config PDA: seeds ["global"] under the pinned pump program. Pure derivation; the
 * result is the protocol's well-known address 4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf.
 * @returns {Promise<string>}
 */
export const globalConfigAddress = () =>
  getProgramDerivedAddress({
    programAddress: address(PUMP_PROGRAM),
    seeds: [utf8.encode(GLOBAL_SEED)],
  }).then(([pda]) => pda);

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {bigint} u64 little-endian
 */
const readU64 = (bytes, offset) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);

/** @param {Uint8Array} bytes @returns {boolean} whether the leading 8 bytes are the Global discriminator */
const hasGlobalDiscriminator = (bytes) => {
  for (const [i, expected] of GLOBAL_DISCRIMINATOR.entries()) {
    if (bytes[i] !== expected) return false;
  }
  return true;
};

/**
 * Decode the one Global config fact progress needs: the configured initial real token
 * reserves. The value is read live because `set_params` can change it — it is never assumed
 * from a documented constant. A zero configuration cannot define progress, so it is rejected
 * as corrupt rather than producing a fabricated ratio. Accounts shorter than the read window
 * are malformed, not legacy: the field sits in the stable original prefix.
 * @param {Uint8Array | null} bytes account data, or null when the account does not exist
 * @returns {GlobalConfigRead}
 */
export const decodeGlobalConfig = (bytes) => {
  if (bytes === null) return { status: "corrupt", reason: "Global config account is absent" };
  if (bytes.length < GLOBAL_MIN_BYTES) {
    return {
      status: "corrupt",
      reason: "Global config account is shorter than the stable layout prefix",
    };
  }
  if (!hasGlobalDiscriminator(bytes)) {
    return { status: "corrupt", reason: "Global data does not carry the Global discriminator" };
  }
  const initialRealTokenReserves = readU64(bytes, INITIAL_REAL_TOKEN_OFFSET);
  if (initialRealTokenReserves === 0n) {
    return { status: "corrupt", reason: "Global config sets zero initial real token reserves" };
  }
  return { status: "decoded", initialRealTokenReserves, ...tradingFields(bytes) };
};

/**
 * The fields only a buy needs. They sit past the prefix the curve read uses, so a shorter
 * account yields undefined rather than a corrupt verdict.
 * @param {Uint8Array} bytes
 */
const tradingFields = (bytes) => {
  const hasFees = bytes.length >= FEE_FIELDS_MIN_BYTES;
  return {
    feeRecipient: hasFees ? bytes.slice(FEE_RECIPIENTS_START, FEE_RECIPIENTS_END) : undefined,
    feeBasisPoints: hasFees ? readU64(bytes, FEE_BASIS_POINTS_OFFSET) : undefined,
    creatorFeeBasisPoints: hasFees ? readU64(bytes, CREATOR_FEE_BASIS_POINTS_OFFSET) : undefined,
    buybackFeeRecipient:
      bytes.length >= BUYBACK_MIN_BYTES
        ? bytes.slice(BUYBACK_RECIPIENTS_START, BUYBACK_RECIPIENTS_END)
        : undefined,
  };
};
