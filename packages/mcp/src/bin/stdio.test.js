// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveProfile } from "@solos/solana";
import { randomSeed, seedAddress, seedToPrivateKeyString } from "@solos/solana/surfnet";

const ROOT = new URL("../../../..", import.meta.url).pathname;
const STDIO_BIN = new URL("stdio.js", import.meta.url).pathname;
/** Synthetic credential embedded in a loopback endpoint's path and query. */
const CREDENTIAL = "qa-synthetic-credential";

/**
 * Spawn the real stdio server as an external MCP client would. The harness opts every test
 * child out of Bun's automatic `.env` loading; real users are unaffected.
 * @param {Record<string, string>} env
 */
const spawnServer = (env) =>
  Bun.spawn([process.execPath, "--no-env-file", STDIO_BIN], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdout: "ignore",
    stderr: "pipe",
  });

/**
 * Read stderr until one line matches, or fail after the deadline.
 * @param {import("bun").Subprocess} proc
 * @param {(line: string) => boolean} done
 * @param {number} deadlineMs
 * @returns {Promise<string[]>}
 */
const stderrLines = async (proc, done, deadlineMs = 20_000) => {
  const lines = [];
  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const timer = new Promise((resolve) => setTimeout(resolve, deadline - Date.now(), "timeout"));
    const chunk = await Promise.race([reader.read(), timer]);
    if (chunk === "timeout" || chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      lines.push(line);
      if (done(line)) return lines;
      newline = buffer.indexOf("\n");
    }
  }
  return lines;
};

/** @type {string | undefined} */
let signerKey;
/** @type {string | undefined} */
let emptyConfigDir;
/** @type {{ url: string; origin: string } | undefined} */
let credentialEndpoint;

beforeAll(async () => {
  signerKey = await seedToPrivateKeyString(randomSeed());
  emptyConfigDir = await mkdtemp(path.join(tmpdir(), "solos-mcp-empty-"));
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
  credentialEndpoint = {
    url: `http://127.0.0.1:${server.port}/qa/${CREDENTIAL}?api-key=${CREDENTIAL}`,
    origin: `http://127.0.0.1:${server.port}`,
  };
  server.stop(true);
});

afterAll(async () => {
  await rm(emptyConfigDir ?? "", { recursive: true, force: true });
});

describe("solos mcp stdio startup line [integration]", () => {
  test("the ready line carries the endpoint origin only, never its credentials", async () => {
    const proc = spawnServer({
      SOLANA_RPC_URL: /** @type {string} */ (credentialEndpoint?.url),
      SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
      SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
      SOLOS_LOG_LEVEL: "warn",
    });
    try {
      const lines = await stderrLines(proc, (line) => line.includes("solos mcp ready"));
      const ready = lines.find((line) => line.includes("solos mcp ready"));
      expect(ready).toBeDefined();
      expect(ready).toContain(credentialEndpoint?.origin);
      expect(ready).not.toContain(CREDENTIAL);
      expect(ready).not.toContain("api-key");
    } finally {
      proc.kill();
    }
  });
});

/** Claude Code's expansion for an unset variable: `${NAME:-fallback}` becomes the fallback. */
const expandUnset = (/** @type {string} */ value) =>
  value.replaceAll(/\$\{[^}:]+(?::-([^}]*))?\}/g, (_match, fallback) => fallback ?? "");

/**
 * The repo's own `.mcp.json` entry, the way Claude Code launches it for an Operator who exports
 * nothing.
 */
const shippedEntry = async () => {
  const config = JSON.parse(await readFile(path.join(ROOT, ".mcp.json"), "utf8"));
  const { args, env = {} } = config.mcpServers.solos;
  return {
    args: /** @type {string[]} */ (args),
    env: Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, expandUnset(String(value))]),
    ),
  };
};

/** A config dir whose only saved profile, and so the default, is named `operator`. */
const operatorConfigDir = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "solos-mcp-operator-"));
  const seed = randomSeed();
  saveProfile(
    { SOLOS_CONFIG_DIR: dir },
    {
      name: "operator",
      profile: {
        provider: "local",
        privateKey: await seedToPrivateKeyString(seed),
        wallet: { address: await seedAddress(seed) },
        createdAt: 0,
      },
    },
  );
  return dir;
};

describe("the shipped .mcp.json [integration]", () => {
  test("starts the server on the Operator's default profile, whatever it is named", async () => {
    const dir = await operatorConfigDir();
    const shipped = await shippedEntry();
    const proc = Bun.spawn([process.execPath, "--no-env-file", ...shipped.args], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        SOLANA_RPC_URL: /** @type {string} */ (credentialEndpoint?.origin),
        SOLOS_CONFIG_DIR: dir,
        ...shipped.env,
      },
      stdout: "ignore",
      stderr: "pipe",
    });
    try {
      const lines = await stderrLines(proc, (line) => /solos mcp (ready|failed)/.test(line));
      expect(lines.join("\n")).toContain("solos mcp ready");
    } finally {
      proc.kill();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
