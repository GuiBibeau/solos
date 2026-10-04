// @ts-check
import { describe, expect, test } from "bun:test";
import { hostTargetName, platformOf, selectTargets, TARGETS } from "./targets.js";

describe("build targets", () => {
  test("all, the host, one name, or a comma-separated list", () => {
    expect(selectTargets("all")).toEqual(TARGETS);
    expect(selectTargets(undefined).map((t) => t.name)).toEqual([hostTargetName()]);
    expect(selectTargets("linux-x64").map((t) => t.name)).toEqual(["linux-x64"]);
    expect(selectTargets("linux-x64, linux-arm64").map((t) => t.name)).toEqual([
      "linux-x64",
      "linux-arm64",
    ]);
  });

  test("an unknown name is refused and the known ones are named", () => {
    expect(() => selectTargets("windows-x64")).toThrow(/unknown build target windows-x64.*all/);
    expect(() => selectTargets(",")).toThrow(/no build target named/);
    expect(() => selectTargets(" , ")).toThrow(/no build target named/);
  });

  test("a target's platform is what npm's os and cpu fields want", () => {
    expect(platformOf(selectTargets("darwin-arm64")[0])).toEqual({ os: "darwin", cpu: "arm64" });
    expect(platformOf(selectTargets("linux-x64")[0])).toEqual({ os: "linux", cpu: "x64" });
  });
});
