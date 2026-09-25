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
 * Which recipient is authorized depends on the coin. Global carries three different
 * fee-recipient fields holding three different keys, and the program accepts one set per coin
 * according to the curve's `is_mayhem_mode` flag. Both were observed on mainnet 2026-09-25 in
 * real on-chain `sell_v2` transactions, and each is refused for the other kind of coin with
 * `NotAuthorized` (6000) from `fee_recipient.rs`:
 *
 * | curve | authorized account | Global field |
 * |---|---|---|
 * | `is_mayhem_mode` false | `62qc2CNX…` | scalar `fee_recipient`, offset 41 |
 * | `is_mayhem_mode` true  | `8SBKzEQU…` | `reserved_fee_recipients`, offset 516 |
 *
 * "Reserved" names the field, not its status: it is the live set for mayhem coins. Picking one
 * for all coins cannot work, and picking the wrong one aborts the whole transaction rather than
 * degrading, so both are decoded and the caller selects on the flag it read from the curve.
 */
const FEE_RECIPIENT_START = 41;
const FEE_RECIPIENT_END = 73;
const MAYHEM_FEE_RECIPIENTS_START = 516;
const MAYHEM_FEE_RECIPIENTS_END = 548;
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
const FEE_FIELDS_MIN_BYTES = MAYHEM_FEE_RECIPIENTS_END;
const BUYBACK_MIN_BYTES = 773;

/** Outcome of decoding the Global config account. @typedef {{ readonly status: "decoded"; readonly initialRealTokenReserves: bigint; readonly feeRecipient: Uint8Array | undefined; readonly mayhemFeeRecipient: Uint8Array | undefined; readonly feeBasisPoints: bigint | undefined; readonly creatorFeeBasisPoints: bigint | undefined; readonly buybackFeeRecipient: Uint8Array | undefined } | { readonly status: "corrupt"; readonly reason: string }} GlobalConfigRead */

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
    feeRecipient: hasFees ? bytes.slice(FEE_RECIPIENT_START, FEE_RECIPIENT_END) : undefined,
    mayhemFeeRecipient: hasFees
      ? bytes.slice(MAYHEM_FEE_RECIPIENTS_START, MAYHEM_FEE_RECIPIENTS_END)
      : undefined,
    feeBasisPoints: hasFees ? readU64(bytes, FEE_BASIS_POINTS_OFFSET) : undefined,
    creatorFeeBasisPoints: hasFees ? readU64(bytes, CREATOR_FEE_BASIS_POINTS_OFFSET) : undefined,
    buybackFeeRecipient:
      bytes.length >= BUYBACK_MIN_BYTES
        ? bytes.slice(BUYBACK_RECIPIENTS_START, BUYBACK_RECIPIENTS_END)
        : undefined,
  };
};
