import { describe, expect, test } from "bun:test";
import { ValidationError } from "../../shared/domain/errors.js";
import { sendSolTool } from "./send-sol.js";
import { simulateSolTool } from "./simulate-sol.js";

describe("transfer tool input guard", () => {
  test("both transfer tools reject zero-equivalent amounts before any runtime", () => {
    for (const tool of [simulateSolTool, sendSolTool]) {
      expect(tool.check, tool.name).toBeTypeOf("function");
      expect(() => tool.check({ to: "x", amountSol: "0" }), tool.name).toThrow(ValidationError);
      expect(() => tool.check({ to: "x", amountSol: "0.000000000" }), tool.name).toThrow(
        ValidationError,
      );
      expect(() => tool.check({ to: "x", amountSol: 4.9e-10 }), tool.name).toThrow(ValidationError);
      expect(tool.check({ to: "x", amountSol: "0.25" }), tool.name).toBeUndefined();
    }
  });
});
