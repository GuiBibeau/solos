import { describe, expect, test } from "bun:test";
import { ValidationError } from "../../shared/domain/errors.js";
import { TransferSolInputSchema } from "../domain/types.js";
import { executeSolTool } from "./execute-sol.js";
import { simulateSolTool } from "./simulate-sol.js";

/** Syntactically valid mainnet address, so only the amount side can fail the schema. */
const VALID_ADDRESS = "So11111111111111111111111111111111111111112";

describe("transfer tool input guard", () => {
  test("both transfer tools reject zero-equivalent amounts before any runtime", () => {
    for (const tool of [simulateSolTool, executeSolTool]) {
      expect(tool.check, tool.name).toBeTypeOf("function");
      expect(() => tool.check({ to: "x", amountSol: "0" }), tool.name).toThrow(ValidationError);
      expect(() => tool.check({ to: "x", amountSol: "0.000000000" }), tool.name).toThrow(
        ValidationError,
      );
      expect(() => tool.check({ to: "x", amountSol: 4.9e-10 }), tool.name).toThrow(ValidationError);
      expect(tool.check({ to: "x", amountSol: "0.25" }), tool.name).toBeUndefined();
    }
  });

  test("the input schema hands numeric zero and negatives to the guard, not to Zod", () => {
    for (const amountSol of [0, -1]) {
      const parsed = TransferSolInputSchema.safeParse({ to: VALID_ADDRESS, amountSol });
      expect(parsed.success, String(amountSol)).toBe(true);
      if (parsed.success) {
        expect(() => simulateSolTool.check(parsed.data), String(amountSol)).toThrow(
          ValidationError,
        );
      }
    }
  });
});
