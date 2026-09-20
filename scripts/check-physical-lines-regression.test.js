// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { addLines, cleanupRepos, createRepo, runCheck } from "./physical-lines-fixture.js";

afterEach(cleanupRepos);

describe("physical line incident regressions [integration]", () => {
  test.each([
    { name: "production exact boundary", path: "src/production.js", lines: 225, code: 0 },
    { name: "production overflow", path: "src/production.js", lines: 226, code: 1 },
    { name: "test exact boundary", path: "src/profile.test.js", lines: 300, code: 0 },
    { name: "test overflow", path: "src/profile.test.js", lines: 301, code: 1 },
    { name: "PR #49 cohesive test", path: "src/profile.test.js", lines: 218, code: 0 },
  ])("$name", async ({ path, lines, code }) => {
    const cwd = await createRepo();
    await addLines(cwd, path, lines);
    expect((await runCheck(cwd)).code).toBe(code);
  });

  test("PR #45 test suites can remain cohesive below the test boundary", async () => {
    const cohesive = await createRepo();
    for (let index = 1; index <= 7; index++)
      await addLines(cohesive, `src/feature-${index}.test.js`, 151);
    expect(await runCheck(cohesive)).toEqual(
      expect.objectContaining({ code: 0, stderr: expect.stringContaining("changed=7") }),
    );
  });
});
