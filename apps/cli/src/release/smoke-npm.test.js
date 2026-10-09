// @ts-check
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { smokeNpm } from "./smoke-npm.js";

/**
 * A stub `solos` the way an npm install leaves it under <prefix>/bin: answers --version, doctor
 * and mcp list the way the real binary does for a release with nothing configured.
 * @param {string} version
 */
const stubInstall = (version) => {
  const prefix = mkdtempSync(path.join(tmpdir(), "solos-stub-prefix-"));
  mkdirSync(path.join(prefix, "bin"));
  const binary = path.join(prefix, "bin", "solos");
  const sha = "a".repeat(40);
  writeFileSync(
    binary,
    `#!/bin/sh
case "$1" in
  --version) echo "${version}" ;;
  doctor) printf '%s' '{"ok":false,"issues":[{"code":"SignerConfigMissing"},{"code":"RpcConfigMissing"}],"release":{"version":"${version}","lane":"stable","commit":"${sha}"}}'; exit 1 ;;
  mcp) printf '%s' '{"server":{"name":"solos","version":"${version}"},"tools":[{"name":"solana_wallet_get_balance"}]}' ;;
esac
`,
  );
  chmodSync(binary, 0o755);
  return prefix;
};

describe("smoke from npm [integration]", () => {
  test("an existing prefix is checked without installing: version, doctor release and mcp list", async () => {
    const prefix = stubInstall("1.2.3");
    const result = await smokeNpm("1.2.3", { prefix });
    expect(result.checks.map((check) => [check.name, check.ok])).toEqual([
      ["version", true],
      ["doctor", true],
      ["mcp list", true],
    ]);
    expect(result.ok).toBe(true);
    const wrong = await smokeNpm("1.2.4", { prefix });
    expect(wrong.ok).toBe(false);
    expect(wrong.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual([
      "version",
      "doctor",
      "mcp list",
    ]);
    rmSync(prefix, { recursive: true, force: true });
  });

  test("a failed install stops before any binary check", async () => {
    const result = await smokeNpm("0.0.0-nope", {
      runner: async () => ({ code: 1, output: "npm ERR! 404 Not Found" }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([
      { name: "install", ok: false, detail: "npm ERR! 404 Not Found" },
    ]);
    rmSync(result.prefix, { recursive: true, force: true });
  });
});
