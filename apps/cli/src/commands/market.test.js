// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

const ROOT = new URL("../../../..", import.meta.url).pathname;
const KEY = "test-elfa-key";
const ANSWER = "SOL drifted lower on profit taking; funding reset https://example.com/funding.";

const solanaEnv = async () => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
});

/**
 * Spawn `bun run solos ...` exactly as a human or agent would, with only the given env.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
const runSolos = async (args, env) => {
  const proc = Bun.spawn([process.execPath, "run", "solos", ...args], {
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
/** @type {{ requests: unknown[]; url: string; stop: () => void }} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      requests.push(1);
      return Response.json({
        success: true,
        data: { message: ANSWER, sessionId: "s-2", creditsConsumed: 1 },
      });
    },
  });
  fixture = { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
});

afterAll(() => fixture?.stop());

describe("`solos market ask` and `solos mcp` through real child processes [integration]", () => {
  test("market ask prints the contract JSON and reaches the loopback fixture", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["market", "ask", "--question", "What changed for SOL today?"],
      { ...(await solanaEnv()), ELFA_API_KEY: KEY, ELFA_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      provider: "elfa",
      answer: ANSWER,
      creditsConsumed: 1,
    });
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("market ask without a key exits 1 with the tagged error, before provider access", async () => {
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(["market", "ask", "--question", "SOL?"], {
      ...(await solanaEnv()),
      ELFA_BASE_URL: fixture.url,
    });
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "IrisConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });

  test("market ask with a blank question exits 1 with IrisQuestionInvalid", async () => {
    const { stderr, code } = await runSolos(["market", "ask", "--question", " ".repeat(3)], {
      ...(await solanaEnv()),
      ELFA_API_KEY: KEY,
      ELFA_BASE_URL: fixture.url,
    });
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "IrisQuestionInvalid" });
  });

  test("mcp list advertises the Iris tool", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], {
      ...(await solanaEnv()),
      ELFA_API_KEY: KEY,
      ELFA_BASE_URL: fixture.url,
    });
    expect(code).toBe(0);
    const names = JSON.parse(stdout).tools.map((/** @type {{ name: string }} */ t) => t.name);
    expect(names).toContain("solana_market_ask_iris");
    expect(names).toContain("solana_wallet_get_balance");
  });

  test("mcp call forwards parent ELFA_* env to the server child (allowlist proof)", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_market_ask_iris", "--args", '{"question":"SOL recap?"}'],
      { ...(await solanaEnv()), ELFA_API_KEY: KEY, ELFA_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ provider: "elfa", answer: ANSWER });
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("mcp call without a parent key returns a structured tool error", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_market_ask_iris", "--args", '{"question":"SOL recap?"}'],
      { ...(await solanaEnv()), ELFA_BASE_URL: fixture.url },
    );
    expect(code).not.toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "IrisConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });
});
