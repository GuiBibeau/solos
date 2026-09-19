// @ts-check
import { describe, expect, test } from "bun:test";
import { PerpInputInvalid } from "../domain/errors.js";
import { getPositionTool } from "./get-position.js";

describe("perp position tool input guard", () => {
  test("rejects symbols that are not exchange grammar before any runtime", () => {
    expect(getPositionTool.check).toBeTypeOf("function");
    for (const market of ["", " ".repeat(3), "SOL PERP", "-SOL", "SOL/PERP"]) {
      expect(() => getPositionTool.check({ market }), JSON.stringify(market)).toThrow(
        PerpInputInvalid,
      );
    }
  });

  test("accepts wire symbols and the documented -PERP alias", () => {
    expect(getPositionTool.check({ market: "SOL" })).toBeUndefined();
    expect(getPositionTool.check({ market: "sol-perp" })).toBeUndefined();
    expect(
      getPositionTool.check({ market: "SOL-PERP", owner: "11111111111111111111111111111111" }),
    ).toBeUndefined();
  });

  test("the schema accepts and describes both arguments", () => {
    expect(getPositionTool.input.shape.market?.description).toBeTruthy();
    expect(getPositionTool.input.shape.owner?.description).toBeTruthy();
    const parsed = getPositionTool.input.parse({ market: "SOL-PERP" });
    expect(parsed.market).toBe("SOL-PERP");
    expect(parsed.owner).toBeUndefined();
  });
});
