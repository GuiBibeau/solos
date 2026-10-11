// @ts-check
import { addDecimal } from "./decimal.js";
import { usdForLamports } from "./usd-for-lamports.js";

/**
 * Confirmed spend. A transfer settles its quoted actual, which already includes its fee.
 * A swap settles the input notional plus the landed fee at the quote's SOL price.
 * A swap whose fee lamports cannot be read returns undefined so the hold stays open.
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 * @returns {string | undefined}
 */
export const confirmedSpendUsd = (quote, sent) => {
  if (quote.solPriceUsd === undefined) return quote.actualUsd;
  const feeUsd = feeUsdAt(sent.feeLamports, quote.solPriceUsd);
  if (feeUsd === undefined) return undefined;
  return addDecimal(quote.actualUsd, feeUsd);
};

/**
 * Failed spend. A swap settles only the landed fee, priced at the quote's SOL price.
 * `isOpen` leaves the hold. No `usd` releases it. A transfer settles `feeUsd` when the
 * submitter priced a landed execution error, and stays open when that price is missing.
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 * @returns {{ readonly usd?: string; readonly isOpen: boolean }}
 */
export const failedSpend = (quote, sent) => {
  if (quote.solPriceUsd === undefined) return unpricedFailure(sent);
  return swapFailed(quote.solPriceUsd, sent);
};

/**
 * @param {string} solPriceUsd
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 * @returns {{ readonly usd?: string; readonly isOpen: boolean }}
 */
const swapFailed = (solPriceUsd, sent) => {
  const feeUsd = feeUsdAt(sent.feeLamports, solPriceUsd);
  if (feeUsd === undefined) return { isOpen: hasSignature(sent) };
  return { usd: feeUsd, isOpen: false };
};

/**
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 * @returns {{ readonly usd?: string; readonly isOpen: boolean }}
 */
const unpricedFailure = (sent) => {
  if (sent.feeUsd === undefined) return { isOpen: hasSignature(sent) };
  return { usd: sent.feeUsd, isOpen: false };
};

/** @param {string | undefined} lamports @param {string} priceUsd */
const feeUsdAt = (lamports, priceUsd) => {
  if (lamports === undefined) return undefined;
  return usdForLamports(lamports, priceUsd);
};

/** @param {import("../ports/tick-submit.js").SubmitResult} sent */
const hasSignature = (sent) =>
  sent.signature !== undefined && sent.signature !== null && sent.signature.length > 0;
