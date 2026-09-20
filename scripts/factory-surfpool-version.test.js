// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** @type {string[]} */
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

/** @param {string} reported */
const check = (reported) => {
  const root = mkdtempSync(path.join(tmpdir(), "factory-surfpool-version-"));
  roots.push(root);
  const binary = path.join(root, "surfpool");
  writeFileSync(binary, `#!/usr/bin/env bash\nprintf '%s\\n' "${reported}"\n`);
  chmodSync(binary, 0o755);
  return Bun.spawnSync(
    ["bash", path.join(import.meta.dir, "factory-surfpool-version.sh"), "1.5.0"],
    { env: { ...process.env, PATH: `${root}:${process.env.PATH}` } },
  ).exitCode;
};

describe("[integration] exact Surfpool version gate", () => {
  test("accepts the exact pinned output", () => expect(check("surfpool 1.5.0")).toBe(0));

  for (const reported of ["surfpool 1.5.0-dev", "surfpool 1.5.0 extra"])
    test(`rejects ${reported}`, () => expect(check(reported)).not.toBe(0));
});
