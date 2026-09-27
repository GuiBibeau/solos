// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedTokenFixtures } from "@solos/solana/market/test-seeds";
import {
  ensureSurfnet,
  randomSeed,
  seedToPrivateKeyString,
  USDC_MINT,
} from "@solos/solana/surfnet";
import { runSolos, stderrJson } from "./cli-fixture.js";

/** Synthetic credential: proves provider text and poisoned env never reach a client. */
const CREDENTIAL = "qa-synthetic-credential";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof seedTokenFixtures>>} */
let fx;
/** @type {string | undefined} */
let emptyConfigDir;
/** @type {string | undefined} */
let poisonedDir;
/** @type {string | undefined} */
let signerKey;
/** @type {{ port: number } | undefined} */
let deadPort;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
  signerKey = await seedToPrivateKeyString(randomSeed());
  emptyConfigDir = await mkdtemp(path.join(tmpdir(), "solos-token-empty-"));
  // A loopback port with nothing listening, carrying a credential-shaped path: the poisoned
  // `.env` endpoint for the env-file isolation regression.
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  deadPort = { port: listener.port };
  listener.stop(true);
  poisonedDir = await mkdtemp(path.join(tmpdir(), "solos-token-poison-"));
  await writeFile(path.join(poisonedDir, "package.json"), '{"name":"poisoned","type":"module"}\n');
  await writeFile(
    path.join(poisonedDir, ".env"),
    `SOLANA_RPC_URL=http://127.0.0.1:${deadPort.port}/v1/${CREDENTIAL}?api-key=${CREDENTIAL}\n`,
  );
});

afterAll(async () => {
  await rm(emptyConfigDir ?? "", { recursive: true, force: true });
  await rm(poisonedDir ?? "", { recursive: true, force: true });
});

describe("token read configuration isolation from developer .env files [integration]", () => {
  test("with env loading enabled, a child really reads and fails against the poisoned .env", async () => {
    // Proof the poison is real: with `.env` loading enabled and no other RPC configuration,
    // the child reads the poisoned endpoint and fails against it.
    const poisoned = await runSolos(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      {
        SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
      { cwd: /** @type {string} */ (poisonedDir), shouldLoadEnvFile: true },
    );
    expect(poisoned.code).not.toBe(0);
    expect(stderrJson(poisoned.stderr)?.error).toMatchObject({
      code: "RpcError",
      url: `http://127.0.0.1:${deadPort?.port}`,
    });
  });

  test("the harness child never reads a developer .env file's RPC configuration", async () => {
    // The harness always spawns with `--no-env-file`: the same child never sees the poison.
    const blocked = await runSolos(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      {
        SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
      { cwd: /** @type {string} */ (poisonedDir) },
    );
    expect(blocked.code).not.toBe(0);
    expect(stderrJson(blocked.stderr)?.error).toMatchObject({ code: "RpcConfigMissing" });
    expect(blocked.stderr).toContain("SOLANA_RPC_URL is not set");
    expect(blocked.stderr).not.toContain(CREDENTIAL);
  });

  test("with explicit test configuration the isolated child still reads successfully", async () => {
    // With the explicit test configuration the read succeeds: isolation changes nothing else.
    const isolated = await runSolos(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      {
        SOLANA_RPC_URL: surfnet.rpcUrl,
        SOLANA_WS_URL: surfnet.wsUrl,
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
      { cwd: /** @type {string} */ (poisonedDir) },
    );
    expect(isolated.code).toBe(0);
    expect(JSON.parse(isolated.stdout)).toMatchObject({ name: "Fixture Dog", symbol: "FDOG" });
    expect(isolated.stderr).not.toContain(CREDENTIAL);
  });
});
