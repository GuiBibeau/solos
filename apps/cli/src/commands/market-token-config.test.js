// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedTokenFixtures } from "@solos/solana/market/test-seeds";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
  USDC_MINT,
} from "@solos/solana/surfnet";
import { runSolos, stderrJson } from "./cli-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof seedTokenFixtures>>} */
let fx;
/** @type {string | undefined} */
let profileDir;
/** @type {string | undefined} */
let emptyConfigDir;
/** @type {{ url: string, port: number } | undefined} */
let deadEndpoint;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
  // A loopback port with nothing listening, carrying credential-looking path and query: the
  // profile endpoint of the precedence tests. solOS must use it only when env is unset, and
  // must redact everything but the origin in errors.
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  deadEndpoint = { url: `http://127.0.0.1:${port}/v1/qa-secret-key?api-key=qa-secret`, port };
  const seed = randomSeed();
  profileDir = await mkdtemp(path.join(tmpdir(), "solos-token-profile-"));
  const keypairPath = path.join(profileDir, "qa.json");
  await writeFile(keypairPath, await seedToPrivateKeyString(seed));
  await writeFile(
    path.join(profileDir, "credentials.json"),
    JSON.stringify({
      version: 1,
      default: "qa",
      profiles: {
        qa: {
          provider: "local",
          keypairPath,
          wallet: { address: await seedAddress(seed) },
          rpcUrl: deadEndpoint.url,
          createdAt: 0,
        },
      },
    }),
  );
  emptyConfigDir = await mkdtemp(path.join(tmpdir(), "solos-token-empty-"));
});

afterAll(async () => {
  await rm(profileDir ?? "", { recursive: true, force: true });
  await rm(emptyConfigDir ?? "", { recursive: true, force: true });
});

describe("`solos market token` RPC configuration precedence [integration]", () => {
  test("SOLANA_RPC_URL wins over the profile's stored rpcUrl (dead endpoint) [integration]", async () => {
    const { stdout, code } = await runSolos(["market", "token", "--mint", fx.classicWithMetaplex], {
      SOLOS_CONFIG_DIR: /** @type {string} */ (profileDir),
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLOS_LOG_LEVEL: "warn",
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ name: "Fixture Dog", symbol: "FDOG" });
  });

  test("without the env var, the dead profile endpoint fails with an origin-redacted RpcError", async () => {
    const { stdout, stderr, code } = await runSolos(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      { SOLOS_CONFIG_DIR: /** @type {string} */ (profileDir), SOLOS_LOG_LEVEL: "warn" },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    const error = stderrJson(stderr)?.error;
    expect(error).toMatchObject({
      code: "RpcError",
      url: `http://127.0.0.1:${deadEndpoint?.port}`,
    });
    expect(JSON.stringify(error)).not.toContain("qa-secret");
  });

  test("market token with no RPC configuration fails clearly, on the CLI", async () => {
    const { stderr, code } = await runSolos(["market", "token", "--mint", fx.classicWithMetaplex], {
      SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
    });
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "RpcConfigMissing" });
    expect(stderr).toContain("SOLANA_RPC_URL is not set");
  });

  test("market token with no RPC configuration fails clearly, through MCP", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.classicWithMetaplex }),
      ],
      {
        SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
        SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
        SOLOS_LOG_LEVEL: "warn",
      },
    );
    expect(code).not.toBe(0);
    expect(stdout).not.toContain("Fixture Dog");
  });
});
