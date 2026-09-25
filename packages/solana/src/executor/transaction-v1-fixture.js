// @ts-check
/**
 * Shared fixture for the v1 boundary suites. One copy, because two drifted apart within a day of
 * each other: the newer rethrew on a non-BuildRejected while the older blind-cast it.
 */

/**
 * The reason a v1 refusal carried. `BuildRejected` keeps its text in `reason`, not `message`, so
 * reading `message` silently yields the empty string and a `toThrow(/…/)` matches anything.
 * @param {() => unknown} run
 * @returns {string}
 */
export const rejectionReasonOf = (run) => {
  try {
    run();
  } catch (error) {
    const reason = /** @type {{ reason?: unknown }} */ (error)?.reason;
    if (typeof reason === "string") return reason;
    throw new Error(`expected a rejection carrying a reason, got ${String(error)}`, {
      cause: error,
    });
  }
  throw new Error("expected a rejection, but the call returned");
};

/** A v1 config every clause accepts, so a test can vary exactly one field. */
export const V1_FIXTURE_CONFIG = Object.freeze({
  computeUnitLimit: 10_000,
  loadedAccountsDataSizeLimit: 65_536,
  priorityFeeLamports: 1000n,
});
