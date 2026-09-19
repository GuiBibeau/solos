// @ts-check
/**
 * Curve progress from real token reserves, the pinned protocol math:
 *
 *   progressBps = clamp(floor((initial - real) x 10000 / initial), 0, 10000)
 *
 * The denominator is the protocol's configured initial real token reserves (read live from the
 * Global config by the adapter), never a hardcoded constant. Everything is BigInt end to end;
 * reserves are never narrowed through a JS Number. Rounding is floor (BigInt integer
 * division) and the result is clamped into 0..10000 — solOS's documented convention, chosen
 * because the protocol documents none. The clamp covers a config-shrunk initial value
 * (negative "sold" floors at 0) and keeps the completed endpoint exactly 10000. The returned
 * number is exact: it is an integer in 0..10000, far below 2^53.
 */

/** Denominator of basis-point math. */
export const BPS_DENOMINATOR = 10_000n;

/**
 * @param {bigint} initialRealTokenReserves the Global config's initial real token reserves; must be > 0
 * @param {bigint} realTokenReserves the curve's current real token reserves
 * @returns {number} progress in basis points, 0..10000, floored
 */
export const progressBps = (initialRealTokenReserves, realTokenReserves) => {
  const sold = initialRealTokenReserves - realTokenReserves;
  const raw = (sold * BPS_DENOMINATOR) / initialRealTokenReserves;
  let clamped = raw;
  if (clamped < 0n) clamped = 0n;
  if (clamped > BPS_DENOMINATOR) clamped = BPS_DENOMINATOR;
  return Number(clamped);
};
