// @ts-check
import { IrisAuthFailed, IrisHttpError, IrisRateLimited } from "@solos/core";

/** @param {number} status @returns {import("@solos/core").IrisError | undefined} */
export const statusError = (status) => {
  if (status === 401 || status === 403) return new IrisAuthFailed({ status });
  if (status === 429) return new IrisRateLimited({ status });
  if (status < 200 || status >= 300)
    return new IrisHttpError({ status, reason: `Elfa answered with HTTP ${status}` });
  return undefined;
};

/** @param {string} body @returns {unknown} */
export const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};
