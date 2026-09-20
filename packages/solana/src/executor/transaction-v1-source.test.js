// @ts-check
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../../../..");

test("production transaction construction stays inside the v1 policy boundary [integration]", () => {
  const glob = new Bun.Glob("{apps,packages}/**/*.js");
  const offenders = [...glob.scanSync({ cwd: root })]
    .filter((file) => !file.endsWith(".test.js"))
    .filter((file) => file !== "packages/solana/src/executor/transaction-v1.js")
    .filter((file) =>
      readFileSync(path.join(root, file), "utf8").includes("createTransactionMessage"),
    );
  expect(offenders).toEqual([]);
});
