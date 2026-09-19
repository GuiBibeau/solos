// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { ensureSurfnet, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { offlineEnv, runSolos, stderrJson, transferEnv } from "./transfer-fixture.js";

/**
 * Amount-boundary cases against the dead loopback RPC with a loadable throwaway signer: the
 * structured failures prove no balance RPC ran, and positives still work against Surfnet.
 */
describe("`solos transfer sol` amount boundary through real child processes [integration]", () => {
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>> | undefined} */
  let surfnet;
  /** Fresh per run; funded so one-lamport simulations stay rent-exempt. */
  /** @type {string} */
  let RECIPIENT;
  /** @type {string[]} */
  const configDirs = [];

  beforeAll(async () => {
    RECIPIENT = await seedAddress(randomSeed());
    surfnet = await ensureSurfnet();
    await surfnet.cheats.fundSol(RECIPIENT, 0.01);
  });

  afterAll(async () => {
    await Promise.all(configDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  /**
   * Run `transfer sol` with the given amount against the dead loopback RPC: nothing downstream
   * is usable, so only the input boundary can explain the structured failure.
   * @param {string} amount
   * @param {string[]} extra
   */
  const rejectOffline = async (amount, extra = []) => {
    const env = await offlineEnv();
    configDirs.push(env.SOLOS_CONFIG_DIR);
    const { stdout, stderr, code } = await runSolos(
      ["transfer", "sol", "--to", RECIPIENT, "--amount", amount, ...extra],
      env,
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "ValidationError",
      field: "amountSol",
    });
  };

  test("rejects --amount 0 with a structured ValidationError", async () => {
    await rejectOffline("0");
  });

  test("rejects decimal-zero --amount 0.000000000 the same way", async () => {
    await rejectOffline("0.000000000");
  });

  test("rejects --amount 0 --simulate-only the same way", async () => {
    await rejectOffline("0", ["--simulate-only"]);
  });

  test("numeric-style --amount 1e-9 fails downstream, never as a parsing defect", async () => {
    const env = await offlineEnv();
    configDirs.push(env.SOLOS_CONFIG_DIR);
    const { stderr, code } = await runSolos(
      ["transfer", "sol", "--to", RECIPIENT, "--amount", "1e-9"],
      env,
    );
    expect(code).not.toBe(0);
    const errorCode = stderrJson(stderr)?.error?.code;
    expect(errorCode).not.toBe("InternalError");
    expect(errorCode).not.toBe("ValidationError");
  });

  test("simulates one lamport against Surfnet through the real CLI", async () => {
    const seed = randomSeed();
    const sender = await seedAddress(seed);
    await surfnet?.cheats.fundSol(sender, 0.1);
    const env = await transferEnv(surfnet?.rpcUrl ?? "", seed);
    configDirs.push(env.SOLOS_CONFIG_DIR);
    const { stdout, code } = await runSolos(
      ["transfer", "sol", "--to", RECIPIENT, "--amount", "0.000000001", "--simulate-only"],
      env,
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ to: RECIPIENT, lamports: "1" });
  });
});
