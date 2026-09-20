// @ts-check
import { createHash } from "node:crypto";
import { getU16Codec, getU32Codec, getU64Codec } from "@solana/kit";
import { dataBytes } from "./jupiter-swap-build-validate.js";

/**
 * The executable-byte binding for the Jupiter v6 swap instruction. solOS signs only amounts it
 * has decoded itself, so the swap payload must be exactly the one supported layout — the
 * documented borsh `route` args whose wire form the fixtures encode: the 8-byte
 * sha256("global:route") discriminator, an empty routePlan vector, the u64 input amount, the
 * u64 quoted output amount, the slippage byte, a zero platform fee, and a zero route-plan
 * tail. Another discriminator, another shape, or truncation is refused before signing; the
 * decoded input is bound to the Action and the decoded quoted output to the envelope's
 * validated outAmount, while the minimum output keeps being enforced through
 * otherAmountThreshold. Fixed reason strings only; BigInt throughout.
 */

/** First 8 bytes of sha256("global:route") — the Jupiter v6 route discriminator. */
export const ROUTE_DISCRIMINATOR = Uint8Array.from(
  createHash("sha256").update("global:route").digest().subarray(0, 8),
);

const ROUTE_DATA_BYTES = 32;
const UNSUPPORTED_LAYOUT_REASON =
  "swap instruction data was not the supported Jupiter route layout";
const EMBEDDED_INPUT_REASON = "swap instruction data did not carry the requested input amount";
const EMBEDDED_OUTPUT_REASON = "swap instruction data did not carry the quoted envelope output";

/**
 * Decode the supported route layout, or undefined for anything else.
 * @param {import("@solana/kit").ReadonlyUint8Array} bytes
 * @returns {{ inAmount: bigint; quotedOutAmount: bigint } | undefined}
 */
const decodeRouteArgs = (bytes) => {
  if (bytes.length !== ROUTE_DATA_BYTES) return undefined;
  if (!ROUTE_DISCRIMINATOR.every((byte, index) => bytes[index] === byte)) return undefined;
  if (getU32Codec().decode(bytes, 8) !== 0) return undefined;
  if (bytes[29] !== 0 || getU16Codec().decode(bytes, 30) !== 0) return undefined;
  return {
    inAmount: getU64Codec().decode(bytes, 12),
    quotedOutAmount: getU64Codec().decode(bytes, 20),
  };
};

/**
 * The pre-sign swap-data rejection: undefined means the payload is the supported layout and its
 * embedded amounts match the validated intent. Pure decoding — nothing signs, sends, or dials.
 * @param {import("./jupiter-swap-build-response.js").RawInstruction} swap
 * @param {import("@solos/actions").SwapAction} action
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
export const swapDataRejection = (swap, action, envelope) => {
  const args = decodeRouteArgs(dataBytes(swap.data));
  if (args === undefined) return UNSUPPORTED_LAYOUT_REASON;
  if (args.inAmount !== BigInt(action.amount)) return EMBEDDED_INPUT_REASON;
  if (args.quotedOutAmount !== BigInt(envelope.outAmount)) return EMBEDDED_OUTPUT_REASON;
  return undefined;
};
