// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedTokenFixtures, setClassicMint, WSOL_MINT } from "@solos/solana/market/test-seeds";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
  USDC_MINT,
} from "@solos/solana/surfnet";

const ROOT = new URL("../../../..", import.meta.url).pathname;
const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");

const solanaEnv = async () => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
});

/**
 * Spawn the CLI entry directly — `bun --no-env-file run apps/cli/src/main.js`. The flag must
 * govern the one process that loads env files: via the `solos` package script a second Bun
 * without the flag loads `.env` files again. Only this harness opts out, never operators.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
const runSolos = async (args, env) => {
  const proc = Bun.spawn([process.execPath, "--no-env-file", "run", CLI_ENTRY, ...args], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
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

describe("`solos market token` and `solos mcp` through real child processes [integration]", () => {
  test("market token prints verified metadata read from the configured RPC endpoint", async () => {
    const { stdout, code } = await runSolos(["market", "token", "--mint", fx.classicWithMetaplex], {
      ...(await solanaEnv()),
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      mint: fx.classicWithMetaplex,
      name: "Fixture Dog",
      symbol: "FDOG",
      decimals: 6,
      logoUri: null,
    });
  });

  test("mcp call returns token-2022 metadata with its on-chain logo through the server child", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.token2022WithExtension }),
      ],
      { ...(await solanaEnv()) },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      mint: fx.token2022WithExtension,
      name: "Fixture Cat",
      symbol: "FCAT",
      decimals: 8,
      logoUri: "https://fixture.example/cat.png",
    });
  });

  test("a mint shaped exactly like a real extended chain mint reads through MCP", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.token2022RealShape }),
      ],
      { ...(await solanaEnv()) },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      mint: fx.token2022RealShape,
      name: "Fixture Cat",
      symbol: "FCAT",
      decimals: 6,
      logoUri: "https://fixture.example/real.png",
    });
  });

  test("a tail-padding token-2022 mint reads through the Metaplex fallback, CLI and MCP", async () => {
    const expected = {
      mint: fx.token2022TailPadding,
      name: "Fixture Owl",
      symbol: "FOWL",
      decimals: 6,
      logoUri: null,
    };
    const cli = await runSolos(["market", "token", "--mint", fx.token2022TailPadding], {
      ...(await solanaEnv()),
    });
    expect(cli.code).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual(expected);
    const mcp = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.token2022TailPadding }),
      ],
      { ...(await solanaEnv()) },
    );
    expect(mcp.code).toBe(0);
    const result = JSON.parse(mcp.stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(expected);
  });

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
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "InternalError" });
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

  test("a token account passed as a mint exits 1 with UnknownToken, never metadata", async () => {
    const { stdout, stderr, code } = await runSolos(
      ["market", "token", "--mint", fx.tokenAccountAsMint],
      {
        ...(await solanaEnv()),
      },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "UnknownToken",
      mint: fx.tokenAccountAsMint,
    });
  });

  test("absent metadata on a valid mint is a structured TokenMetadataUnavailable through MCP", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.bareClassic }),
      ],
      { ...(await solanaEnv()) },
    );
    expect(code).not.toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "TokenMetadataUnavailable",
      mint: fx.bareClassic,
    });
  });

  test("wSOL with wrong on-chain decimals never maps canonically, through the CLI", async () => {
    await setClassicMint(surfnet.rpcUrl, WSOL_MINT, 6);
    const { stderr, code } = await runSolos(["market", "token", "--mint", WSOL_MINT], {
      ...(await solanaEnv()),
    });
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "TokenMetadataUnavailable" });
    await setClassicMint(surfnet.rpcUrl, WSOL_MINT, 9);
  });
});
