// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { runSolos, stderrJson, unusableSignerEnv } from "./transfer-fixture.js";

/**
 * Pre-signer boundary cases: the signer cannot even load (nonexistent keypair file, dead RPC),
 * so a structured ValidationError proves the amount was rejected before the signer Layer was
 * acquired, while a good amount only fails later as SignerUnavailable. One child process per
 * test, so every deadline measures a single startup.
 */
describe("`solos transfer sol` rejects bad amounts before the missing keypair is touched [integration]", () => {
  /** @type {string} */
  let RECIPIENT;
  /** @type {string[]} */
  const configDirs = [];

  beforeAll(async () => {
    RECIPIENT = await seedAddress(randomSeed());
  });

  afterAll(async () => {
    await Promise.all(configDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  /**
   * @param {string[]} amountArg e.g. ["--amount", "0"] or ["--amount=--1"]
   * @param {string[]} extra command modifiers after the amount
   */
  const rejectWithoutSigner = async (amountArg, extra = ["--simulate-only"]) => {
    const env = await unusableSignerEnv();
    configDirs.push(env.SOLOS_CONFIG_DIR);
    const { stdout, stderr, code } = await runSolos(
      ["transfer", "sol", "--to", RECIPIENT, ...amountArg, ...extra],
      env,
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    const error = stderrJson(stderr)?.error;
    expect(error).toMatchObject({ code: "ValidationError", field: "amountSol" });
    expect(["SignerUnavailable", "RpcError", "InternalError"]).not.toContain(error?.code);
  };

  test("simulate-only rejects zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "0"]);
  });

  test("simulate-only rejects decimal zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "0.000000000"]);
  });

  test("simulate-only rejects truncate-to-zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "4.9e-10"]);
  });

  test("simulate-only rejects negative scientific pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "-1e-9"]);
  });

  test("send with skipped simulation rejects zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "0"], ["--skip-simulation"]);
  });

  test("send rejects zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "0"], []);
  });

  test("send rejects decimal zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "0.000000000"], []);
  });

  test("send rejects truncate-to-zero pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "4.9e-10"], []);
  });

  test("send rejects negative scientific pre-signer", async () => {
    await rejectWithoutSigner(["--amount", "-1e-9"], []);
  });

  test("send rejects a double-sign amount pre-signer", async () => {
    await rejectWithoutSigner(["--amount=--1"], []);
  });

  test("send rejects a double-sign fraction pre-signer", async () => {
    await rejectWithoutSigner(["--amount=--1.1"], []);
  });

  test("a good amount in the same broken-signer env fails later as SignerUnavailable", async () => {
    const env = await unusableSignerEnv();
    configDirs.push(env.SOLOS_CONFIG_DIR);
    const { stderr, code } = await runSolos(
      ["transfer", "sol", "--to", RECIPIENT, "--amount", "0.25", "--simulate-only"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error?.code).toBe("SignerUnavailable");
  });
});
