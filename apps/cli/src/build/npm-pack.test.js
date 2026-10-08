// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { packNpm } from "./npm-pack.js";

/** @type {string} */
let dist = "";
/** @type {string} */
let outdir = "";

beforeAll(async () => {
  dist = await mkdtemp(path.join(tmpdir(), "solos-pack-dist-"));
  outdir = await mkdtemp(path.join(tmpdir(), "solos-pack-out-"));
  // Two of four binaries built, as a partial run would leave them; stand-ins, not executables.
  writeFileSync(path.join(dist, "solos-darwin-arm64"), "#!/bin/sh\necho darwin-arm64\n");
  writeFileSync(path.join(dist, "solos-linux-x64"), "#!/bin/sh\necho linux-x64\n");
});

afterAll(async () => {
  await rm(dist, { recursive: true, force: true });
  await rm(outdir, { recursive: true, force: true });
});

/** @param {string} dir */
const manifest = (dir) => JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));

describe("solos dev pack assembles the npm packages", () => {
  test("one platform package per built binary, then the launcher, in publish order", () => {
    const { packages } = packNpm({ dist, outdir, version: "1.2.3" });
    expect(packages.map((pkg) => pkg.name)).toEqual([
      "@solos-sh/cli-darwin-arm64",
      "@solos-sh/cli-linux-x64",
      "@solos-sh/cli",
    ]);
  });

  test("a platform package carries the executable binary and its os/cpu gate", () => {
    const dir = path.join(outdir, "cli-linux-x64");
    const pkg = manifest(dir);
    expect(pkg).toMatchObject({
      name: "@solos-sh/cli-linux-x64",
      version: "1.2.3",
      os: ["linux"],
      cpu: ["x64"],
      files: ["bin"],
      license: "Apache-2.0",
      publishConfig: { access: "public" },
    });
    expect(pkg.repository.directory).toBe("apps/cli");
    expect(statSync(path.join(dir, "bin", "solos")).mode & 0o111).not.toBe(0);
    expect(readFileSync(path.join(dir, "bin", "solos"), "utf8")).toContain("linux-x64");
    expect(readFileSync(path.join(dir, "LICENSE"), "utf8")).toContain("Apache License");
  });

  test("the launcher pins exactly the packed platform packages at the same version", () => {
    const dir = path.join(outdir, "cli");
    const pkg = manifest(dir);
    expect(pkg).toMatchObject({
      name: "@solos-sh/cli",
      version: "1.2.3",
      type: "module",
      mcpName: "io.github.GuiBibeau/solos",
      bin: { solos: "launcher.js" },
      files: ["launcher.js", "launcher-lib.js"],
      optionalDependencies: {
        "@solos-sh/cli-darwin-arm64": "1.2.3",
        "@solos-sh/cli-linux-x64": "1.2.3",
      },
    });
    expect(readFileSync(path.join(dir, "launcher.js"), "utf8")).toContain("#!/usr/bin/env node");
    expect(readFileSync(path.join(dir, "launcher-lib.js"), "utf8")).toContain("export const run");
    expect(readFileSync(path.join(dir, "README.md"), "utf8")).toContain("npm i -g @solos-sh/cli");
  });

  test("a non-semver version and an empty dist are refused", () => {
    expect(() => packNpm({ dist, outdir, version: "solos@1.2.3" })).toThrow("semver");
    expect(() => packNpm({ dist: outdir, outdir, version: "1.2.3" })).toThrow(
      "no solos-* binaries",
    );
  });
});
