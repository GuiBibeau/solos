// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { CLI_ENTRY, runSolos } from "../../cli/src/commands/cli-fixture.js";
import { ENGINE_TOKEN, engineFetch, freePort } from "./engine-fixture.js";

/** @param {string[]} chunks */
const readyFrom = (chunks) => {
  const line = chunks
    .join("")
    .split("\n")
    .find((item) => item.includes("solos engine ready"));
  return line === undefined ? undefined : JSON.parse(line);
};

/**
 * @param {AsyncIterable<Uint8Array>} stream
 * @param {string[]} chunks
 */
const collect = async (stream, chunks) => {
  const decoder = new TextDecoder();
  for await (const chunk of stream) chunks.push(decoder.decode(chunk));
};

/**
 * @param {string} signature
 * @param {Record<string, string>} env
 */
const inspectSignature = async (signature, env) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const last = await runSolos(["dev", "inspect", "transaction", signature], env);
    if (last.code === 0) return JSON.parse(last.stdout);
    await Bun.sleep(500);
  }
  throw new Error("inspect did not see the signature");
};

describe("`solos engine start --paper` from the checkout [integration]", () => {
  test("starts surfpool, lands a transfer, and the CLI can inspect it", async () => {
    const seed = randomSeed();
    const privateKey = await seedToPrivateKeyString(seed);
    const dataDir = mkdtempSync(path.join(tmpdir(), "solos-engine-paper-"));
    const port = freePort();
    const proc = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        "run",
        CLI_ENTRY,
        "engine",
        "start",
        "--paper",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--data-dir",
        dataDir,
      ],
      {
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          SOLOS_ENGINE_TOKEN: ENGINE_TOKEN,
          SOLOS_SIGNER_PRIVATE_KEY: privateKey,
          SOLOS_CONFIG_DIR: dataDir,
          SOLOS_LOG_LEVEL: "info",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    /** @type {string[]} */
    const chunks = [];
    const reading = collect(proc.stderr, chunks);
    try {
      const ready = await (async () => {
        const deadline = Date.now() + 45_000;
        while (Date.now() < deadline) {
          const parsed = readyFrom(chunks);
          if (parsed !== undefined) return parsed;
          await Bun.sleep(200);
        }
        throw new Error("paper engine did not become ready");
      })();
      expect(ready.mode).toBe("paper");
      expect(ready.tier).toBe("execute");
      expect(ready.url).toBe(`http://127.0.0.1:${port}`);
      expect(chunks.join("").includes(ENGINE_TOKEN)).toBe(false);
      const health = await engineFetch({ url: ready.url, token: ENGINE_TOKEN }, "/v1/health");
      expect(health.status).toBe(200);
      expect(health.body.mode).toBe("paper");
      expect(health.body.signer).toBe(await seedAddress(seed));
      const to = await seedAddress(randomSeed());
      const sent = await engineFetch(
        { url: ready.url, token: ENGINE_TOKEN },
        "/v1/actions/execute",
        {
          method: "POST",
          body: {
            action: { type: "transfer_sol", to, lamports: "1000000" },
            intentId: crypto.randomUUID(),
          },
        },
      );
      expect(sent.status).toBe(200);
      expect(sent.body.status).toBe("confirmed");
      const inspected = await inspectSignature(sent.body.signature, {
        SOLOS_DEV: "1",
        SOLANA_RPC_URL: ready.rpcHost,
        SOLOS_SIGNER_PRIVATE_KEY: privateKey,
        SOLOS_CONFIG_DIR: dataDir,
        SOLOS_LOG_LEVEL: "warn",
      });
      expect(inspected.signature).toBe(sent.body.signature);
      expect(inspected.error).toBeNull();
    } finally {
      proc.kill("SIGTERM");
      const exited = await Promise.race([proc.exited, Bun.sleep(8000).then(() => null)]);
      if (exited === null) proc.kill("SIGKILL");
      await proc.exited;
      await reading;
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180_000);
});
