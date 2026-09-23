// @ts-check
/** BigInt-safe simulation error text; never crash when the RPC returns bigint fields.
 * @param {unknown} value
 */
export const simulationErrorText = (value) =>
  JSON.stringify(value, (/** @type {string} */ key, /** @type {unknown} */ v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
