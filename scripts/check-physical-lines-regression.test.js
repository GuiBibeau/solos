// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { addLines, cleanupRepos, createRepo, runCheck } from "./physical-lines-fixture.js";

afterEach(cleanupRepos);

describe("physical line incident regressions [integration]", () => {
  test.each([
    { name: "production exact boundary", path: "src/production.js", lines: 150, code: 0 },
    { name: "production overflow", path: "src/production.js", lines: 151, code: 1 },
    { name: "PR #49 oversized test", path: "src/profile.test.js", lines: 218, code: 1 },
  ])("$name", async ({ path, lines, code }) => {
    const cwd = await createRepo();
    await addLines(cwd, path, lines);
    expect((await runCheck(cwd)).code).toBe(code);
  });

  test("PR #45 seven-file overflow fails and its split layout passes", async () => {
    const oversized = await createRepo();
    for (let index = 1; index <= 7; index++)
      await addLines(oversized, `src/feature-${index}.test.js`, 151);
    const failed = await runCheck(oversized);
    expect(failed.code).toBe(1);
    expect(failed.stderr.match(/physical lines \(maximum 150\)/gu)).toHaveLength(7);

    const split = await createRepo();
    for (let index = 1; index <= 7; index++) {
      await addLines(split, `src/feature-${index}-a.test.js`, 76);
      await addLines(split, `src/feature-${index}-b.test.js`, 75);
    }
    expect(await runCheck(split)).toEqual(
      expect.objectContaining({ code: 0, stderr: expect.stringContaining("changed=14") }),
    );
  });
});
