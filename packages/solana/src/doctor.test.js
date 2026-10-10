// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveProfile } from "./credentials/store.js";
import { diagnoseSolanaEnv } from "./doctor.js";

const ADDRESS = "So11111111111111111111111111111111111111112";
const RPC = "http://127.0.0.1:8899";
/** @type {string} */
let dir;
/** @type {string} */
let emptyDir;

/** @param {string} name @param {Record<string, unknown>} profile */
const save = (name, profile) =>
  saveProfile(
    { SOLOS_CONFIG_DIR: dir },
    { name, profile: { wallet: { address: ADDRESS }, createdAt: 1, ...profile } },
  );

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "solos-doctor-"));
  emptyDir = mkdtempSync(path.join(tmpdir(), "solos-doctor-empty-"));
  save("norpc", { provider: "local", keypairPath: "/k.json" });
  save("withrpc", { provider: "local", keypairPath: "/k.json", rpcUrl: RPC });
  save("nosigner", { provider: "local" });
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(emptyDir, { recursive: true, force: true });
});

const codes = (report) =>
  report.issues.map((issue) => issue.code).toSorted((a, b) => a.localeCompare(b));

describe("solos doctor diagnosis [integration]", () => {
  test("reports a missing signer and a missing RPC URL together, not one at a time", () => {
    const report = diagnoseSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir });
    expect(report.ok).toBe(false);
    expect(codes(report)).toEqual(["RpcConfigMissing", "SignerConfigMissing"]);
    expect(report.issues.every((issue) => issue.remedy.length > 0)).toBe(true);
  });

  test("flags a profile with no rpcUrl and no SOLANA_RPC_URL as that specific trap", () => {
    const report = diagnoseSolanaEnv({ SOLOS_CONFIG_DIR: dir, SOLOS_PROFILE: "norpc" });
    expect(report.profile).toBe("norpc");
    expect(report.signer).toBe("local (profile)");
    expect(codes(report)).toContain("ProfileRpcUrlMissing");
  });

  test("an env signer means the profile is ignored, exactly as the runtime does", () => {
    // loadSolanaEnv drops the profile when an env signer is set, so the profile rpcUrl must not
    // let doctor certify a configuration that startup rejects.
    const report = diagnoseSolanaEnv({
      SOLOS_CONFIG_DIR: dir,
      SOLOS_PROFILE: "withrpc",
      SOLOS_SIGNER_PRIVATE_KEY: "qa-secret-value",
    });
    expect(report.signer).toBe("privateKey (env)");
    expect(codes(report)).toEqual(["RpcConfigMissing"]);
  });

  test("redacts the RPC credentials, reporting only the origin", () => {
    const report = diagnoseSolanaEnv({
      SOLOS_CONFIG_DIR: dir,
      SOLANA_RPC_URL: "https://user:pass@rpc.example.com/v1/qa-secret?api-key=qa-secret",
      SOLOS_SIGNER_PRIVATE_KEY: "qa-secret-value",
    });
    expect(report.ok).toBe(true);
    expect(report.rpcOrigin).toBe("https://rpc.example.com");
    const rendered = JSON.stringify(report);
    expect(rendered).not.toContain("qa-secret");
    expect(rendered).not.toContain("pass");
  });

  test("keeps diagnosing after an invalid environment value", () => {
    const report = diagnoseSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, ELFA_BASE_URL: "not-a-url" });
    expect(codes(report)).toEqual(["InvalidConfig", "RpcConfigMissing", "SignerConfigMissing"]);
  });

  test("engine mode needs no local signer and names a missing engine variable", () => {
    const ready = diagnoseSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: RPC,
      SOLOS_EXECUTOR: "engine",
      SOLOS_ENGINE_URL: "http://127.0.0.1:8787",
      SOLOS_ENGINE_TOKEN: "engine-token",
    });
    expect(ready.ok).toBe(true);
    expect(ready.signer).toBe("engine");
    expect(JSON.stringify(ready)).not.toContain("engine-token");

    const missing = diagnoseSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: RPC,
      SOLOS_EXECUTOR: "engine",
    });
    expect(codes(missing)).toEqual(["EngineConfigMissing", "EngineConfigMissing"]);
    expect(missing.issues.map((issue) => issue.reason).join(" ")).toContain("SOLOS_ENGINE_URL");
    expect(missing.issues.map((issue) => issue.reason).join(" ")).toContain("SOLOS_ENGINE_TOKEN");
    expect(codes(missing)).not.toContain("SignerConfigMissing");
  });

  test("flags a local profile that names no signer source", () => {
    const report = diagnoseSolanaEnv({
      SOLOS_CONFIG_DIR: dir,
      SOLOS_PROFILE: "nosigner",
      SOLANA_RPC_URL: RPC,
    });
    expect(codes(report)).toContain("ProfileSignerMissing");
    expect(report.ok).toBe(false);
  });
});
