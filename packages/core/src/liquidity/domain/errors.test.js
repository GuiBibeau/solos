// @ts-check
import { describe, expect, test } from "bun:test";
import { LIFECYCLE_PROTOCOL_REMEDY, LiquidityUnsupportedProtocol } from "./errors.js";

describe("liquidity domain errors", () => {
  test("an unsupported protocol says what is wrong and names the accepted values", () => {
    const error = new LiquidityUnsupportedProtocol({ protocol: "orca" });
    expect(error.reason).toContain("orca");
    expect(error.remedy).toBe("pass protocol orca, raydium or meteora");
  });

  test("a lifecycle raise site narrows the remedy so following it cannot repeat the failure", () => {
    const error = new LiquidityUnsupportedProtocol({
      protocol: "orca",
      remedy: LIFECYCLE_PROTOCOL_REMEDY,
    });
    expect(error.remedy).toBe(LIFECYCLE_PROTOCOL_REMEDY);
    expect(error.remedy).toContain("raydium or meteora");
    expect(error.remedy).not.toContain("orca, raydium or meteora");
  });
});
