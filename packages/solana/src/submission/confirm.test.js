// @ts-check
import { describe, expect, test } from "bun:test";
import { confirmationState } from "./confirm.js";

const FAILED = { InstructionError: [0, "Custom"] };

describe("confirmationState", () => {
  test("at confirmed, confirmed and finalized rows are landed and processed is still pending", () => {
    expect(confirmationState(null)).toBe("pending");
    expect(confirmationState({ confirmationStatus: "processed", err: null })).toBe("pending");
    expect(confirmationState({ confirmationStatus: "confirmed", err: null })).toBe("success");
    expect(confirmationState({ confirmationStatus: "finalized", err: null })).toBe("success");
  });

  test("an execution error is final only once the row reaches the commitment", () => {
    expect(confirmationState({ confirmationStatus: "processed", err: FAILED })).toBe("pending");
    expect(confirmationState({ confirmationStatus: "confirmed", err: FAILED })).toBe("failed");
    expect(confirmationState({ confirmationStatus: "finalized", err: FAILED })).toBe("failed");
  });

  test("at finalized, a confirmed row is still pending", () => {
    expect(confirmationState({ confirmationStatus: "confirmed", err: null }, "finalized")).toBe(
      "pending",
    );
    expect(confirmationState({ confirmationStatus: "confirmed", err: FAILED }, "finalized")).toBe(
      "pending",
    );
    expect(confirmationState({ confirmationStatus: "finalized", err: null }, "finalized")).toBe(
      "success",
    );
  });
});
