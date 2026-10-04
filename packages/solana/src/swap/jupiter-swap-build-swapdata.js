// @ts-check
import { getU16Codec, getU32Codec, getU64Codec } from "@solana/kit";
import { dataBytes } from "./jupiter-swap-build-validate.js";

/**
 * Jupiter V2 ExactIn keeps the economic contract before its opaque route plan. Shared-account
 * routes add one router-id byte after the discriminator. The route plan stays opaque because its
 * Swap enum changes as venues are added; its bounded vector header is still checked before sign.
 */

export const ROUTE_V2_DISCRIMINATOR = Uint8Array.of(187, 100, 250, 204, 49, 196, 175, 20);
export const SHARED_ROUTE_V2_DISCRIMINATOR = Uint8Array.of(209, 152, 83, 147, 124, 254, 216, 233);

const MAX_ROUTE_STEPS = 32;
const MIN_STEP_BYTES = 5;
const variants = [
  { discriminator: ROUTE_V2_DISCRIMINATOR, amountOffset: 8, layout: "route-v2" },
  {
    discriminator: SHARED_ROUTE_V2_DISCRIMINATOR,
    amountOffset: 9,
    layout: "shared-accounts-route-v2",
  },
];
const UNSUPPORTED_LAYOUT_REASON =
  "swap instruction data was not the supported Jupiter route layout";
const EMBEDDED_INPUT_REASON = "swap instruction data did not carry the requested input amount";
const EMBEDDED_OUTPUT_REASON = "swap instruction data did not carry the quoted envelope output";
const EMBEDDED_SLIPPAGE_REASON =
  "swap instruction data did not carry the requested maximum slippage";
const EMBEDDED_FEE_REASON = "swap instruction data did not carry the required zero-fee contract";

/** @param {import("@solana/kit").ReadonlyUint8Array} bytes */
const matchingVariant = (bytes) =>
  variants.find(({ discriminator }) => discriminator.every((byte, index) => bytes[index] === byte));

/** Derive the fixed account layout only from the already-allowlisted instruction discriminator.
 * @param {import("./jupiter-swap-build-response.js").RawInstruction} swap */
export const swapRouteLayout = (swap) => matchingVariant(dataBytes(swap.data))?.layout;

/** @param {import("@solana/kit").ReadonlyUint8Array} bytes */
const decodeRouteArgs = (bytes) => {
  const variant = matchingVariant(bytes);
  if (!variant) return undefined;
  const offset = variant.amountOffset;
  const planOffset = offset + 22;
  if (bytes.length < planOffset + 4) return undefined;
  const steps = getU32Codec().decode(bytes, planOffset);
  if (steps === 0 || steps > MAX_ROUTE_STEPS) return undefined;
  if (bytes.length < planOffset + 4 + steps * MIN_STEP_BYTES) return undefined;
  return {
    inAmount: getU64Codec().decode(bytes, offset),
    quotedOutAmount: getU64Codec().decode(bytes, offset + 8),
    slippageBps: getU16Codec().decode(bytes, offset + 16),
    platformFeeBps: getU16Codec().decode(bytes, offset + 18),
    positiveSlippageBps: getU16Codec().decode(bytes, offset + 20),
  };
};

/**
 * @param {import("./jupiter-swap-build-response.js").RawInstruction} swap
 * @param {import("@solos-sh/actions").SwapAction} action
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
export const swapDataRejection = (swap, action, envelope) => {
  const args = decodeRouteArgs(dataBytes(swap.data));
  if (args === undefined) return UNSUPPORTED_LAYOUT_REASON;
  if (args.inAmount !== BigInt(action.amount)) return EMBEDDED_INPUT_REASON;
  if (args.quotedOutAmount !== BigInt(envelope.outAmount)) return EMBEDDED_OUTPUT_REASON;
  if (args.slippageBps !== action.maxSlippageBps) return EMBEDDED_SLIPPAGE_REASON;
  if (args.platformFeeBps !== 0 || args.positiveSlippageBps !== 0) return EMBEDDED_FEE_REASON;
  return undefined;
};
