// @ts-check
import { describe, expect, test } from "bun:test";
import { ancestryCommand, guardedPushCommand } from "./branch-push-protection.js";

const HEAD = "a".repeat(40);

describe("atomic branch push protection", () => {
  test("guards an existing branch with its exact remote head and fast-forward ancestry", () => {
    expect(ancestryCommand("factory/test", HEAD)).toContain(
      `merge-base --is-ancestor '${HEAD}' 'refs/heads/factory/test'`,
    );
    expect(guardedPushCommand("factory/test", HEAD)).toContain(
      `--force-with-lease='refs/heads/factory/test:${HEAD}'`,
    );
  });

  test("atomically creates only an absent branch", () => {
    expect(ancestryCommand("factory/test", undefined)).toBeUndefined();
    expect(guardedPushCommand("factory/test", undefined)).toContain(
      "--force-with-lease='refs/heads/factory/test:'",
    );
  });
});
