// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSolos, stderrJson } from "./cli-fixture.js";

/**
 * `solos daemon` and `solos agent run` start the harness, which loads the same Solana env. They
 * report a missing signer as a typed error, not a defect with a stack.
 */
describe("harness-backed commands report config failures as typed errors [integration]", () => {
  test("solos daemon with no signer is SignerConfigMissing, never InternalError", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "solos-daemon-config-"));
    try {
      const { stderr, code } = await runSolos(["daemon"], {
        SOLOS_CONFIG_DIR: dir,
        SOLANA_RPC_URL: "http://127.0.0.1:1",
        SOLOS_LOG_LEVEL: "warn",
      });
      expect(code).not.toBe(0);
      expect(stderrJson(stderr)?.error).toMatchObject({ code: "SignerConfigMissing" });
      expect(stderr).not.toContain("    at ");
      expect(stderr).not.toContain("/Users/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("solos agent run with no signer is SignerConfigMissing, never InternalError", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "solos-agent-config-"));
    try {
      const { stderr, code } = await runSolos(["agent", "run", "hello"], {
        SOLOS_CONFIG_DIR: dir,
        SOLANA_RPC_URL: "http://127.0.0.1:1",
        SOLOS_LOG_LEVEL: "warn",
      });
      expect(code).not.toBe(0);
      expect(stderrJson(stderr)?.error).toMatchObject({ code: "SignerConfigMissing" });
      expect(stderr).not.toContain("    at ");
      expect(stderr).not.toContain("/Users/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
