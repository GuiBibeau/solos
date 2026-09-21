// @ts-check
import { describe, expect, test } from "bun:test";
import { confirmationState, isConfirmedLanded } from "./transfer-confirm.js";

describe("confirmationState", () => {
  test("distinguishes pending, success, and failed statuses", () => {
    expect(confirmationState(null)).toBe("pending");
    expect(confirmationState({ confirmationStatus: "processed", err: null })).toBe("pending");
    expect(confirmationState({ confirmationStatus: "confirmed", err: null })).toBe("success");
    expect(confirmationState({ confirmationStatus: "finalized", err: null })).toBe("success");
    expect(
      confirmationState({
        confirmationStatus: "confirmed",
        err: { InstructionError: [0, "Custom"] },
      }),
    ).toBe("failed");
    expect(
      confirmationState({
        confirmationStatus: "finalized",
        err: { InstructionError: [0, "Custom"] },
      }),
    ).toBe("failed");
  });
});

describe("isConfirmedLanded", () => {
  test("only confirmed or finalized with a null err counts as landed", () => {
    expect(isConfirmedLanded(null)).toBe(false);
    expect(isConfirmedLanded({ confirmationStatus: "processed", err: null })).toBe(false);
    expect(isConfirmedLanded({ confirmationStatus: "confirmed", err: null })).toBe(true);
    expect(isConfirmedLanded({ confirmationStatus: "finalized", err: null })).toBe(true);
    expect(
      isConfirmedLanded({
        confirmationStatus: "confirmed",
        err: { InstructionError: [0, "Custom"] },
      }),
    ).toBe(false);
  });
});
