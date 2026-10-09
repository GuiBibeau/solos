// @ts-check
import { describe, expect, test } from "bun:test";
import { diffToolRows, groupByType, parseSubjects, renderNotes, toolRows } from "./notes.js";

const log = [
  "feat(landing): static landing site (#212)",
  "chore(hosting): keep env files out of uploads (#213)",
  "fix: perp close waits for the API (#230)",
  "Merge something odd",
  "",
].join("\n");

describe("release notes", () => {
  test("parses squash subjects into type, scope, title and PR", () => {
    const entries = parseSubjects(log);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({
      type: "feat",
      scope: "landing",
      title: "static landing site",
      pr: 212,
    });
    expect(entries[2]).toEqual({
      type: "fix",
      scope: null,
      title: "perp close waits for the API",
      pr: 230,
    });
    expect(entries[3]).toEqual({
      type: "other",
      scope: null,
      title: "Merge something odd",
      pr: null,
    });
  });

  test("groups by type in a fixed order", () => {
    expect(groupByType(parseSubjects(log)).map((g) => g.heading)).toEqual([
      "Features",
      "Fixes",
      "Chores",
      "Other",
    ]);
  });

  test("diffs tool rows of the generated reference", () => {
    const before = toolRows("| `a` | read | x |\n| `b` | read | y |\n");
    const after = toolRows("| `a` | read | x |\n| `b` | read | y, beta |\n| `c` | read | z |\n");
    expect(diffToolRows(before, after)).toEqual({ added: ["c"], removed: [], changed: ["b"] });
  });

  test("renders headings, bullets, the tools section and a Migration placeholder for a major", () => {
    const markdown = renderNotes({
      version: "1.0.0",
      since: "solos@0.1.0",
      entries: parseSubjects(log),
      toolDiff: { added: ["c"], removed: [], changed: ["b"] },
      major: true,
    });
    expect(markdown).toContain("# solos 1.0.0");
    expect(markdown).toContain("## Features\n\n- landing: static landing site (#212)");
    expect(markdown).toContain("## Tools\n\n- Added `c`\n- Changed `b`");
    expect(markdown).toContain("## Migration\n\n<!-- Required for a major");
    expect(
      renderNotes({
        version: "0.1.1",
        since: "solos@0.1.0",
        entries: [],
        toolDiff: { added: [], removed: [], changed: [] },
        major: false,
      }),
    ).not.toContain("## Migration");
  });
});
