// @ts-check
/**
 * Uniform basis-point shares for one token side of an existing Meteora bin window.
 * `floor(10000 / N)`, with the leftover one bps at a time on the lowest indexes.
 */

/** @param {number} count @returns {number[]} */
export const uniformBps = (count) => {
  if (count <= 0) return [];
  const each = Math.floor(10_000 / count);
  const extra = 10_000 - each * count;
  return Array.from({ length: count }, (_unused, index) => each + (index < extra ? 1 : 0));
};
