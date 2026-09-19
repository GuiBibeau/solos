// @ts-check
import {
  PerpAuthFailed,
  PerpHttpError,
  PerpMarketUnknown,
  PerpRateLimited,
} from "@solos/core";

/**
 * Non-2xx status to the provider-unavailable family, or undefined for 2xx. Reasons are fixed
 * strings: raw failure bodies and the base URL never travel.
 * @param {number} status
 * @returns {import("@solos/core").PerpError | undefined}
 */
export const statusError = (status) => {
  if (status === 401 || status === 403) return new PerpAuthFailed({ status });
  if (status === 429) return new PerpRateLimited({ status });
  if (status < 200 || status >= 300) {
    return new PerpHttpError({ status, reason: `Phoenix perps answered with HTTP ${status}` });
  }
  return undefined;
};

/**
 * The market endpoint's 404 is a typed unknown market, not a generic HTTP failure. Any other
 * non-2xx status falls through to the shared mapping.
 * @param {number} status
 * @param {string} market
 * @returns {import("@solos/core").PerpError | undefined}
 */
export const marketStatusError = (status, market) => {
  if (status === 404) return new PerpMarketUnknown({ market });
  return statusError(status);
};
