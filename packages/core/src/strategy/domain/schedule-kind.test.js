// @ts-check
import { describe, expect, test } from "bun:test";
import { WSOL_MINT } from "@solos-sh/actions";
import { evaluateSchedule } from "./schedule-kind.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SWAP = {
  type: "swap",
  inputMint: WSOL_MINT,
  outputMint: USDC,
  amount: "1000",
  maxSlippageBps: 50,
};

describe("schedule kind", () => {
  test("too little SOL fails with a reason and still returns the Actions", () => {
    const decision = evaluateSchedule(
      { actions: [SWAP] },
      { lamports: "0", instant: 1 },
      undefined,
    );
    expect(decision.actions).toEqual([SWAP]);
    expect(decision.failure?.reason).toContain("lamports");
    expect(decision.note).toContain("cannot fund the swap");
  });
});
