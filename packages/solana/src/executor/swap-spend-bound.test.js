// @ts-check
import { describe, expect, test } from "bun:test";
import { SWAP_OVERHEAD_LAMPORTS_MAX, maxSpendLamports } from "./swap-spend-bound.js";

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** @param {string} inputMint @param {string} amount */
const action = (inputMint, amount) =>
  /** @type {import("@solos/actions").SwapAction} */ ({
    type: "swap",
    inputMint,
    outputMint: inputMint === WSOL ? USDC : WSOL,
    amount,
    maxSlippageBps: 50,
  });

describe("swap spend bound", () => {
  test("a SOL input may cost its own amount plus the overhead allowance", () => {
    expect(maxSpendLamports(action(WSOL, "10000000"))).toBe(
      10_000_000n + SWAP_OVERHEAD_LAMPORTS_MAX,
    );
  });

  test("a token input may cost the overhead allowance and nothing more", () => {
    expect(maxSpendLamports(action(USDC, "1000000"))).toBe(SWAP_OVERHEAD_LAMPORTS_MAX);
  });

  // Both measured on mainnet 2026-09-24 at 50 bps; see ADR-0024 for the sampling.
  test("the allowance clears fee-only overhead by orders of magnitude", () => {
    // SOL -> USDC, both accounts already open: 105,000 lamports of fee on 18 of 20 routes.
    const feesOnly = 10_105_000n - 10_000_000n;
    expect(feesOnly * 190n).toBeLessThan(SWAP_OVERHEAD_LAMPORTS_MAX);
  });

  test("the allowance clears the worst observed account-opening overhead", () => {
    // SOL -> BONK, destination account absent: 14,638,880 lamports on half its routes.
    const withNewAccounts = 114_638_880n - 100_000_000n;
    expect(withNewAccounts).toBeLessThan(SWAP_OVERHEAD_LAMPORTS_MAX);
  });

  test("the allowance still caps a drain far below the trade it accompanies", () => {
    // A 1 SOL swap may lose at most 2% beyond its input, and proportionally less as size grows.
    const oneSol = 1_000_000_000n;
    expect(maxSpendLamports(action(WSOL, String(oneSol))) - oneSol).toBe(
      SWAP_OVERHEAD_LAMPORTS_MAX,
    );
    expect(SWAP_OVERHEAD_LAMPORTS_MAX * 50n).toBe(oneSol);
  });

  test("the allowance is exact base units, never a float", () => {
    expect(typeof maxSpendLamports(action(WSOL, "1"))).toBe("bigint");
    expect(maxSpendLamports(action(WSOL, "18446744073709551615"))).toBe(
      18_446_744_073_709_551_615n + SWAP_OVERHEAD_LAMPORTS_MAX,
    );
  });

  test("the bound does not scale with notional: overhead is account rent and fees", () => {
    const small = maxSpendLamports(action(WSOL, "10000000")) - 10_000_000n;
    const large = maxSpendLamports(action(WSOL, "10000000000")) - 10_000_000_000n;
    expect(small).toBe(large);
  });
});
