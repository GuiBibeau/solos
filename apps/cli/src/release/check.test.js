// @ts-check
import { describe, expect, test } from "bun:test";
import { checkReleasePr, releaseBranchVersion } from "./check.js";

const manifest = (version) => ({ version, packages: [{ version }] });

describe("release PR check", () => {
  test("reads the version from the branch name", () => {
    expect(releaseBranchVersion("release/0.2.0")).toBe("0.2.0");
    expect(releaseBranchVersion("release/next")).toBeNull();
    expect(releaseBranchVersion("main")).toBeNull();
  });

  test("a patch release passes with matching server.json and a notes file", () => {
    const report = checkReleasePr({
      branch: "release/0.1.1",
      serverJson: manifest("0.1.1"),
      notes: "# solos 0.1.1",
    });
    expect(report).toEqual({ ok: true, version: "0.1.1", major: false, problems: [] });
  });

  test("names every mismatch with a remedy", () => {
    const report = checkReleasePr({
      branch: "release/0.1.1",
      serverJson: manifest("0.1.0"),
      notes: null,
    });
    expect(report.ok).toBe(false);
    expect(report.problems.map((p) => p.reason)).toEqual([
      "server.json version is 0.1.0, the branch says 0.1.1",
      "server.json packages[0].version is 0.1.0, the branch says 0.1.1",
      "docs/releases/0.1.1.md is missing",
    ]);
    expect(report.problems[2]?.remedy).toContain("solos dev release notes 0.1.1 --out");
  });

  test("a major needs a filled Migration section and an ADR link", () => {
    const placeholder = "# solos 1.0.0\n\n## Migration\n\n<!-- fill me -->\n";
    const report = checkReleasePr({
      branch: "release/1.0.0",
      serverJson: manifest("1.0.0"),
      notes: placeholder,
    });
    expect(report.major).toBe(true);
    expect(report.problems.map((p) => p.reason)).toEqual([
      '1.0.0 is a major and docs/releases/1.0.0.md has no filled "## Migration" section',
      "1.0.0 is a major and docs/releases/1.0.0.md names no ADR",
    ]);
    const filled =
      "# solos 1.0.0\n\nSee docs/adr/0040-break.md.\n\n## Migration\n\nRename x to y.\n\n## Tools\n";
    expect(
      checkReleasePr({ branch: "release/1.0.0", serverJson: manifest("1.0.0"), notes: filled }).ok,
    ).toBe(true);
  });

  test("a branch that is not release/<semver> is refused outright", () => {
    const report = checkReleasePr({ branch: "feat/x", serverJson: manifest("0.1.1"), notes: null });
    expect(report.version).toBeNull();
    expect(report.problems[0]?.remedy).toContain("solos dev release prepare");
  });
});
