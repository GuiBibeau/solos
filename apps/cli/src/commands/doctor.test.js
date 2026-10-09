// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSolos } from "./cli-fixture.js";

describe("solos doctor through a real child process [integration]", () => {
  test("exits non-zero with JSON, every issue at once, and a paste-ready config", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "solos-doctor-cli-"));
    try {
      const { stdout, code } = await runSolos(["doctor"], {
        SOLOS_CONFIG_DIR: dir,
        SOLOS_LOG_LEVEL: "warn",
      });
      expect(code).not.toBe(0);
      const report = JSON.parse(stdout);
      expect(report.ok).toBe(false);
      expect(
        report.issues.map((issue) => issue.code).toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(["RpcConfigMissing", "SignerConfigMissing"]);
      // A checkout is the source lane: version 0.0.0 and no commit.
      expect(report.release).toEqual({ version: "0.0.0", lane: "source", commit: null });
      // The paste-ready config names the real server command and opts out of ambient .env files.
      expect(JSON.stringify(report.mcpConfig)).toContain("--no-env-file");
      expect(JSON.stringify(report.mcpConfig)).toContain("stdio.js");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
