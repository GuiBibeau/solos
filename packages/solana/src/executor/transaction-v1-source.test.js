// @ts-check
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../../../..");

test("production transaction construction stays inside the v1 or Phoenix onboarding v0 policy boundaries [integration]", () => {
  const glob = new Bun.Glob("{apps,packages}/**/*.js");
  const offenders = [...glob.scanSync({ cwd: root })]
    .filter((file) => !file.endsWith(".test.js"))
    .filter((file) => file !== "packages/solana/src/executor/transaction-v1.js")
    // Official Phoenix onboarding co-signing examples use v0, never v1.
    .filter((file) => file !== "packages/solana/src/perp/phoenix-onboard-v0.js")
    .filter((file) =>
      readFileSync(path.join(root, file), "utf8").includes("createTransactionMessage"),
    );
  expect(offenders).toEqual([]);
});
