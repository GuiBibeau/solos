// @ts-check
import { describe, expect, test } from "bun:test";
import {
  canaryVersion,
  compareVersions,
  formatVersion,
  isMajor,
  laneOf,
  newestStable,
  parseVersion,
  releaseTag,
  stableVersion,
} from "./version.js";

/** @param {() => unknown} fn */
const thrown = (fn) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

/** A parsed version the tests know is valid. @param {string} t */
const v = (t) => /** @type {NonNullable<ReturnType<typeof parseVersion>>} */ (parseVersion(t));

describe("release versions", () => {
  test("parses and formats semver with an optional prerelease", () => {
    expect(parseVersion("0.1.0")).toEqual({ major: 0, minor: 1, patch: 0, prerelease: null });
    expect(parseVersion("1.2.3-canary.7.g1f232a4")?.prerelease).toBe("canary.7.g1f232a4");
    expect(parseVersion("v1.2.3")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("01.0.0")).toBeNull();
    expect(parseVersion("1.0.0-01")).toBeNull();
    expect(parseVersion("1.0.0-")).toBeNull();
    expect(parseVersion("1.0.0-rc.1")?.prerelease).toBe("rc.1");
    expect(parseVersion("9007199254740992.0.0")).toBeNull();
    expect(parseVersion("9007199254740991.0.0")?.major).toBe(9_007_199_254_740_991);
    expect(formatVersion({ major: 1, minor: 2, patch: 3, prerelease: "rc.1" })).toBe("1.2.3-rc.1");
  });

  test("the newest stable tag wins; prereleases and foreign tags are ignored", () => {
    const tags = [
      "v9.9.9",
      "solos@0.1.0",
      "solos@0.2.0-canary.3.gabcdef0",
      "solos@0.1.2",
      "actions@1.0.0",
    ];
    expect(newestStable(tags)).toEqual({ major: 0, minor: 1, patch: 2, prerelease: null });
    expect(newestStable(["actions@1.0.0"])).toBeNull();
  });

  test("a canary is the next patch with run and short sha, as the issue states", () => {
    const base = { major: 0, minor: 1, patch: 0, prerelease: null };
    expect(canaryVersion({ base, run: 7, sha: "1f232a4abcdef" })).toBe("0.1.1-canary.7.g1f232a4");
    expect(thrown(() => canaryVersion({ base, run: -1, sha: "1f232a4" }))).toMatchObject({
      _tag: "ReleaseRefused",
      remedy: "pass the workflow run number as --run",
    });
    expect(thrown(() => canaryVersion({ base, run: 7, sha: "nothex" }))).toMatchObject({
      _tag: "ReleaseRefused",
      remedy: "pass the commit sha as --sha",
    });
  });

  test("a stable bump moves one component and resets the lower ones", () => {
    const base = { major: 0, minor: 1, patch: 2, prerelease: null };
    expect(stableVersion({ base, bump: "patch" })).toBe("0.1.3");
    expect(stableVersion({ base, bump: "minor" })).toBe("0.2.0");
    expect(stableVersion({ base, bump: "major" })).toBe("1.0.0");
    const edge = { major: 0, minor: 0, patch: 9_007_199_254_740_991, prerelease: null };
    expect(thrown(() => stableVersion({ base: edge, bump: "patch" }))).toMatchObject({
      _tag: "ReleaseRefused",
    });
  });

  test("the lane is read from the version alone", () => {
    expect(laneOf("0.0.0")).toBe("source");
    expect(laneOf("0.1.1-canary.7.g1f232a4")).toBe("canary");
    expect(laneOf("0.1.1")).toBe("stable");
    expect(laneOf("garbage")).toBe("source");
  });

  test("versions compare by major, minor, patch only", () => {
    expect(compareVersions(v("0.1.0"), v("0.1.1"))).toBeLessThan(0);
    expect(compareVersions(v("0.2.0"), v("0.1.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.0.0"), v("1.0.0-canary.1.gabcdef0"))).toBe(0);
  });

  test("a major is x.0.0 with no prerelease", () => {
    expect(isMajor("1.0.0")).toBe(true);
    expect(isMajor("1.0.1")).toBe(false);
    expect(isMajor("1.0.0-canary.1.gabcdef0")).toBe(false);
    expect(releaseTag("1.0.0")).toBe("solos@1.0.0");
  });
});
