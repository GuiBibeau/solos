// @ts-check
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { exitOnFailure } from "./output.js";
import { withSolos } from "./runtime.js";

const RPC = "http://127.0.0.1:8899";

/** Run an effect through the real CLI failure reporter and return what reached stderr. */
const stderrOf = async (effect) => {
  /** @type {string[]} */
  const chunks = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await Effect.runPromise(exitOnFailure(effect));
  } finally {
    process.stderr.write = original;
  }
  return chunks.join("");
};

describe("CLI configuration failures", () => {
  /** @type {Record<string, string | undefined>} */
  let saved;
  /** @type {string} */
  let dir;

  beforeEach(() => {
    saved = { ...process.env };
    dir = mkdtempSync(path.join(tmpdir(), "solos-cli-config-"));
    process.env.SOLOS_CONFIG_DIR = dir;
    delete process.env.SOLOS_SIGNER_PRIVATE_KEY;
    delete process.env.SOLOS_SIGNER_KEYPAIR_PATH;
    delete process.env.SOLANA_RPC_URL;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.env = saved;
    rmSync(dir, { recursive: true, force: true });
    process.exitCode = 0;
  });

  test("a missing signer is a typed domain error with a remedy, not InternalError", async () => {
    process.env.SOLANA_RPC_URL = RPC;
    const text = await stderrOf(withSolos(Effect.void));
    const payload = JSON.parse(text);
    expect(payload.error.code).toBe("SignerConfigMissing");
    expect(payload.error.reason).toContain("no signer");
    expect(payload.error.remedy).toContain("solos login");
    expect(text).not.toContain("    at ");
    expect(text).not.toContain("/Users/");
    expect(process.exitCode).toBe(1);
  });

  test("a missing rpc url is a typed domain error, not InternalError", async () => {
    process.env.SOLOS_SIGNER_PRIVATE_KEY = "x";
    const text = await stderrOf(withSolos(Effect.void));
    const payload = JSON.parse(text);
    expect(payload.error.code).toBe("RpcConfigMissing");
    expect(payload.error.reason).toContain("SOLANA_RPC_URL");
    expect(text).not.toContain("    at ");
    expect(text).not.toContain("/Users/");
  });

  test("a genuine defect stays InternalError and still leaks no stack or path", async () => {
    const text = await stderrOf(Effect.die(new Error("boom")));
    const payload = JSON.parse(text);
    expect(payload.error.code).toBe("InternalError");
    expect(text).not.toContain("    at ");
    expect(text).not.toContain("/Users/");
  });

  test("an absolute path embedded in a defect message is redacted", async () => {
    const text = await stderrOf(
      Effect.die(
        new Error("ENOENT: no such file or directory, open '/Users/guillaume/qa-wallet.json'"),
      ),
    );
    const payload = JSON.parse(text);
    expect(payload.error.code).toBe("InternalError");
    expect(text).not.toContain("/Users/");
    expect(text).toContain("<path>");
  });
});
