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

const ROOT = new URL("../../../..", import.meta.url).pathname;
/** Absolute CLI entry, so a test child can be spawned from any working directory. */
const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");
/** Synthetic credential: proves provider text and poisoned env never reach a client. */
const CREDENTIAL = "qa-synthetic-credential";

/**
 * Spawn the CLI entry exactly as `bun --no-env-file run apps/cli/src/main.js` — the harness
 * opts every test child out of Bun's automatic `.env` loading so a developer's repo-root
 * `.env.local` can never supply configuration into a test.
 * @param {string[]} args
 * @param {Record<string, string>} env
 * @param {{ cwd?: string; shouldLoadEnvFile?: boolean }} [options] `shouldLoadEnvFile: false`
 *   spawns WITH `.env` loading, only to prove the poison is real
 */
const runCli = async (args, env, options = {}) => {
  const { cwd = ROOT, shouldLoadEnvFile = true } = options;
  const proc = Bun.spawn(
    [process.execPath, ...(shouldLoadEnvFile ? [] : ["--no-env-file"]), "run", CLI_ENTRY, ...args],
    {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

/**
 * `bun run` wraps the CLI's stderr with its own lines; pick the JSON line the CLI printed.
 * @param {string} stderr
 * @returns {any} the parsed CLI output, or undefined when stderr has no JSON line
 */
const stderrJson = (stderr) => {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("{"));
  return line === undefined ? undefined : JSON.parse(line);
};

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
/** @type {{ url: string; origin: string } | undefined} */
let leaky;
/** @type {{ port: number } | undefined} */
let deadPort;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
  signerKey = await seedToPrivateKeyString(randomSeed());
  emptyConfigDir = await mkdtemp(path.join(tmpdir(), "solos-token-empty-"));
  // A loopback JSON-RPC endpoint whose every answer echoes a synthetic credential in the
  // provider error message, on a URL that carries the credential in path and query.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32_603,
          message: `internal quota failure for key ${CREDENTIAL} (endpoint ${CREDENTIAL})`,
        },
      }),
  });
  leaky = {
    url: `http://127.0.0.1:${server.port}/qa/${CREDENTIAL}?api-key=${CREDENTIAL}`,
    origin: `http://127.0.0.1:${server.port}`,
  };
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

describe("token read redaction and configuration isolation [integration]", () => {
  test("a provider error message carrying a credential never reaches the CLI output", async () => {
    const { stdout, stderr, code } = await runCli(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      {
        SOLANA_RPC_URL: /** @type {string} */ (leaky?.url),
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).not.toContain(CREDENTIAL);
    const error = stderrJson(stderr)?.error;
    expect(error).toMatchObject({
      code: "RpcError",
      url: leaky?.origin,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(JSON.stringify(error)).not.toContain(CREDENTIAL);
  });

  test("the same leaky endpoint stays clean through the real MCP server", async () => {
    const { stdout, stderr, code } = await runCli(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.classicWithMetaplex }),
      ],
      {
        SOLANA_RPC_URL: /** @type {string} */ (leaky?.url),
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
    );
    expect(code).not.toBe(0);
    expect(stderr).not.toContain(CREDENTIAL);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "RpcError",
      url: leaky?.origin,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
  });

  test("a developer .env file cannot supply RPC configuration to a test child", async () => {
    const poisonedEnv = {
      SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
      SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
      SOLOS_LOG_LEVEL: "warn",
    };
    // Proof the poison is real: with `.env` loading enabled and no other RPC configuration,
    // the child reads the poisoned endpoint and fails against it.
    const poisoned = await runCli(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      poisonedEnv,
      { cwd: /** @type {string} */ (poisonedDir) },
    );
    expect(poisoned.code).not.toBe(0);
    expect(stderrJson(poisoned.stderr)?.error).toMatchObject({
      code: "RpcError",
      url: `http://127.0.0.1:${deadPort?.port}`,
    });
    // The harness always spawns with `--no-env-file`: the same child never sees the poison.
    const blocked = await runCli(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      poisonedEnv,
      { cwd: /** @type {string} */ (poisonedDir), shouldLoadEnvFile: false },
    );
    expect(blocked.code).not.toBe(0);
    expect(stderrJson(blocked.stderr)?.error).toMatchObject({ code: "InternalError" });
    expect(blocked.stderr).toContain("SOLANA_RPC_URL is not set");
    expect(blocked.stderr).not.toContain(CREDENTIAL);
    // With the explicit test configuration the read succeeds: isolation changes nothing else.
    const isolated = await runCli(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      {
        SOLANA_RPC_URL: surfnet.rpcUrl,
        SOLANA_WS_URL: surfnet.wsUrl,
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
      { cwd: /** @type {string} */ (poisonedDir), shouldLoadEnvFile: false },
    );
    expect(isolated.code).toBe(0);
    expect(JSON.parse(isolated.stdout)).toMatchObject({ name: "Fixture Dog", symbol: "FDOG" });
    expect(isolated.stderr).not.toContain(CREDENTIAL);
  });
});
