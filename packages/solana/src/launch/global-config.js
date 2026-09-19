// @ts-check
import { address, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { GLOBAL_DISCRIMINATOR, GLOBAL_SEED, PUMP_PROGRAM } from "./pump-program.js";

const utf8 = getUtf8Encoder();

/** `initial_real_token_reserves` sits in the stable original Global prefix: bytes 89..97. */
const INITIAL_REAL_TOKEN_OFFSET = 89;
/** Minimum Global length solOS reads: everything through the offset above. */
const GLOBAL_MIN_BYTES = 97;

/** Outcome of decoding the Global config account. @typedef {{ readonly status: "decoded"; readonly initialRealTokenReserves: bigint } | { readonly status: "corrupt"; readonly reason: string }} GlobalConfigRead */

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
  return { status: "decoded", initialRealTokenReserves };
};
