// @ts-check
import { describe, expect, test } from "bun:test";
import { readRegion, replaceRegion } from "./regions.js";

const doc = [
  "prose above",
  "<!-- generated: tools -->",
  "| a |",
  "<!-- /generated: tools -->",
  "prose below",
].join("\n");

describe("generated regions", () => {
  test("reads the body between the markers, trimmed", () => {
    expect(readRegion(doc, "tools")).toBe("| a |");
  });

  test("an absent region reads as null, not as an empty body", () => {
    expect(readRegion(doc, "slices")).toBeNull();
  });

  test("an unterminated region reads as null rather than swallowing the rest of the file", () => {
    expect(readRegion("<!-- generated: tools -->\n| a |", "tools")).toBeNull();
  });

  test("replacing a region keeps the prose on both sides", () => {
    const next = replaceRegion(doc, "tools", "| b |");
    expect(next).toContain("prose above");
    expect(next).toContain("prose below");
    expect(readRegion(next, "tools")).toBe("| b |");
  });

  test("replacing is idempotent", () => {
    const once = replaceRegion(doc, "tools", "| b |");
    expect(replaceRegion(once, "tools", "| b |")).toBe(once);
  });

  test("writing an absent region throws instead of appending a duplicate block", () => {
    expect(() => replaceRegion(doc, "slices", "| b |")).toThrow('no "slices" region to write');
  });
});
