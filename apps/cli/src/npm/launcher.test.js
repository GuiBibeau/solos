// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { binaryPath, platformPackage, SUPPORTED } from "./launcher-lib.js";

const LAUNCHER_FILES = ["launcher.js", "launcher-lib.js"];
const launcherFile = (/** @type {string} */ name) => fileURLToPath(new URL(name, import.meta.url));
/** Node when the machine has it, since npm runs the launcher under Node; Bun otherwise. */
const NODE = Bun.which("node") ?? process.execPath;

/** @type {string} */
let root = "";
/** @type {string} */
let launcher = "";

/**
 * An install the way npm lays it out: the launcher package beside the platform package for this
 * machine, whose "binary" is a script that echoes its arguments and exits with the code asked.
 */
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "solos-launcher-"));
  const scoped = path.join(root, "node_modules", "@solos-sh");
  const platform = path.join(scoped, `cli-${process.platform}-${process.arch}`);
  mkdirSync(path.join(platform, "bin"), { recursive: true });
  writeFileSync(path.join(platform, "package.json"), '{"name":"platform","version":"0.0.0"}');
  const fake = path.join(platform, "bin", "solos");
  writeFileSync(fake, '#!/bin/sh\necho "args: $*"\n[ "$1" = "fail" ] && exit 7\nexit 0\n');
  chmodSync(fake, 0o755);
  mkdirSync(path.join(scoped, "cli"), { recursive: true });
  launcher = path.join(scoped, "cli", "launcher.js");
  for (const name of LAUNCHER_FILES)
    copyFileSync(launcherFile(name), path.join(scoped, "cli", name));
  writeFileSync(path.join(scoped, "cli", "package.json"), '{"name":"cli","type":"module"}');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** @param {string[]} args */
const runLauncher = async (args) => {
  const proc = Bun.spawn([NODE, launcher, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

describe("the npm launcher", () => {
  test("names the platform package for supported machines and null otherwise", () => {
    expect(platformPackage("darwin", "arm64")).toBe("@solos-sh/cli-darwin-arm64");
    expect(platformPackage("linux", "x64")).toBe("@solos-sh/cli-linux-x64");
    expect(platformPackage("win32", "x64")).toBeNull();
    expect(SUPPORTED).toHaveLength(4);
  });

  test("resolves the binary next to the platform package's manifest, or null when absent", () => {
    expect(binaryPath("pkg", () => "/x/node_modules/pkg/package.json")).toBe(
      "/x/node_modules/pkg/bin/solos",
    );
    expect(
      binaryPath("pkg", () => {
        throw new Error("Cannot find module");
      }),
    ).toBeNull();
  });

  test("runs the installed binary with the arguments and relays its exit code", async () => {
    const ok = await runLauncher(["mcp", "serve", "--tier", "read"]);
    expect(ok.code).toBe(0);
    expect(ok.stdout.trim()).toBe("args: mcp serve --tier read");
    const failed = await runLauncher(["fail"]);
    expect(failed.code).toBe(7);
  });
});
