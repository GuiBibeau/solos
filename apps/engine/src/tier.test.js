// @ts-check
import { describe, expect, test } from "bun:test";
import { tierRefusal } from "./tier.js";

describe("engine tier ceiling", () => {
  test("dry run allows simulate and refuses execute by naming the flag", () => {
    expect(tierRefusal("simulate", "simulate")).toBeUndefined();
    const refusal = tierRefusal("simulate", "execute");
    expect(refusal?.tier).toBe("simulate");
    expect(refusal?.reason).toContain("simulate");
    expect(refusal?.remedy).toContain("--tier execute");
  });

  test("read withholds simulate", () => {
    const refusal = tierRefusal("read", "simulate");
    expect(refusal?.reason).toContain("read");
    expect(refusal?.remedy).toContain("--tier simulate");
  });

  test("execute allows both", () => {
    expect(tierRefusal("execute", "simulate")).toBeUndefined();
    expect(tierRefusal("execute", "execute")).toBeUndefined();
  });
});
