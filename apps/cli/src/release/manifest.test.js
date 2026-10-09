// @ts-check
import { describe, expect, test } from "bun:test";
import { bumpedManifest } from "./manifest.js";

describe("the manifest bump", () => {
  test("moves both version fields and nothing else", () => {
    const text = JSON.stringify(
      {
        name: "io.github.GuiBibeau/solos",
        version: "0.1.0",
        packages: [{ version: "0.1.0", x: 1 }],
      },
      null,
      2,
    );
    const bumped = JSON.parse(bumpedManifest(text, "0.1.1"));
    expect(bumped).toEqual({
      name: "io.github.GuiBibeau/solos",
      version: "0.1.1",
      packages: [{ version: "0.1.1", x: 1 }],
    });
    expect(bumpedManifest(text, "0.1.1").endsWith("}\n")).toBe(true);
  });

  test("refuses a missing, malformed or packageless manifest", () => {
    expect(() => bumpedManifest(null, "0.1.1")).toThrow();
    expect(() => bumpedManifest("{ not json", "0.1.1")).toThrow();
    expect(() => bumpedManifest('{"version":"0.1.0"}', "0.1.1")).toThrow();
  });
});
