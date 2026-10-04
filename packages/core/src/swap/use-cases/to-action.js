// @ts-check
/**
 * The slice request becomes the shared contract's swap Action. The venue stays omitted:
 * omission means Jupiter, and explicit pump launch buys are a separate action path. Amounts
 * cross as exact decimal strings.
 * @param {import("../domain/types.js").SwapQuoteRequest} request
 * @returns {import("@solos-sh/actions").SwapAction}
 */
export const toSwapAction = (request) => ({
  type: "swap",
  inputMint: request.inputMint,
  outputMint: request.outputMint,
  amount: request.amount,
  maxSlippageBps: request.slippageBps,
});
