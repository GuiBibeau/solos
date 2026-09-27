// @ts-check
import { describe, expect, test } from "bun:test";
import { SLOW, SubmissionModeSchema } from "./mode.js";

describe("Submission modes", () => {
  test("slow simulates, rechecks the lifetime and waits for confirmed", () => {
    expect(SLOW).toEqual({
      name: "slow",
      simulate: true,
      lifetime: { recheck: true, commitment: "confirmed", minBlocksRemaining: 0 },
      confirmation: { commitment: "confirmed", deadlineMs: 75_000, pollMs: 400 },
    });
  });

  test("a mode is a preset of the one schema: unknown parameters are refused", () => {
    const withExtra = { ...SLOW, rebroadcastMs: 100 };
    expect(SubmissionModeSchema.safeParse(withExtra).success).toBe(false);
    const nested = { ...SLOW, lifetime: { ...SLOW.lifetime, skip: true } };
    expect(SubmissionModeSchema.safeParse(nested).success).toBe(false);
  });

  test("headroom stays within one blockhash lifetime and confirmation cannot wait below confirmed", () => {
    const lifetime = { ...SLOW.lifetime, minBlocksRemaining: 151 };
    expect(SubmissionModeSchema.safeParse({ ...SLOW, lifetime }).success).toBe(false);
    const confirmation = { ...SLOW.confirmation, commitment: "processed" };
    expect(SubmissionModeSchema.safeParse({ ...SLOW, confirmation }).success).toBe(false);
  });
});
