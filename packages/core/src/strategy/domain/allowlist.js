// @ts-check
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";

/**
 * The first mint on the Strategy list that is outside the Engine allowlist.
 * An empty Strategy list means any mint the Engine already allows. An empty Engine list means any mint.
 * @param {ReadonlyArray<string>} strategyMints
 * @param {ReadonlyArray<string>} engineMints
 */
export const widenedMint = (strategyMints, engineMints) => {
  if (engineMints.length === 0 || strategyMints.length === 0) return undefined;
  return strategyMints.find((mint) => !engineMints.includes(mint));
};

/**
 * @param {string} mint
 * @param {ReadonlyArray<string>} engineMints
 */
export const allowlistRefusal = (mint, engineMints) =>
  new BoundsExceeded({
    bound: "allowedMints",
    limit: engineMints.join(","),
    requested: mint,
    scope: "strategy",
    reason: `mint ${mint} is outside the Engine allowlist`,
    remedy: "drop that mint from the Strategy allowlist",
  });
