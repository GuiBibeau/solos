// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startTestEngine } from "../../../engine/src/engine-fixture.js";
import { runSolos, stderrJson } from "./cli-fixture.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const FEATURES = { features: ["STRATEGIES"] };

const prices = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const ids = new URL(request.url).searchParams.get("ids") ?? USDC;
      return Response.json({ [ids]: { usdPrice: 150 } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

const bounds = {
  maxNotionalPerTickUsd: "1",
  maxDailySpendUsd: "2",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
};
const action = { type: "transfer_sol", to: USDC, lamports: "1" };

const schedule = () => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions: [action], count: 2 },
  tickSource: { type: "clock", every: 60_000 },
  bounds,
});

const trigger = () => ({
  owner: "swarm",
  kind: "trigger",
  params: { observe: { price: USDC }, condition: "above", priceUsd: "100", action },
  tickSource: { type: "clock", cron: "0 * * * *" },
  bounds: { ...bounds, allowedMints: [USDC] },
});

/** @param {Awaited<ReturnType<typeof startTestEngine>>} engine @param {string} baseUrl */
const callerEnv = (engine, baseUrl) => ({
  SOLOS_ENGINE_URL: engine.url,
  SOLOS_ENGINE_TOKEN: engine.token,
  SOLOS_EXECUTOR: "engine",
  SOLANA_RPC_URL: engine.surfnet.rpcUrl,
  SOLANA_WS_URL: engine.surfnet.wsUrl,
  SOLOS_TOOL_TIER: "execute",
  SOLOS_TOOLS: "all",
  SOLOS_LOG_LEVEL: "warn",
  JUPITER_API_KEY: "test-key",
  JUPITER_BASE_URL: baseUrl,
});

describe("`solos strategy` help [integration]", () => {
  test("the group is absent unless the process was started with STRATEGIES", async () => {
    const off = await runSolos(["--help"], { SOLOS_LOG_LEVEL: "warn" });
    const on = await runSolos(["--help"], { SOLOS_LOG_LEVEL: "warn" }, FEATURES);
    expect(off.code).toBe(0);
    expect(on.code).toBe(0);
    expect(off.stdout).not.toMatch(/\bstrategy\b/);
    expect(on.stdout).toMatch(/\bstrategy\b/);
  });
});

describe("`solos strategy` against a paper engine [integration]", () => {
  /** @type {ReturnType<typeof prices> | undefined} */
  let feed;
  /** @type {Awaited<ReturnType<typeof startTestEngine>> | undefined} */
  let engine;
  /** @type {string} */
  let file;

  beforeAll(async () => {
    feed = prices();
    const dir = mkdtempSync(path.join(tmpdir(), "solos-strategy-cli-"));
    file = path.join(dir, "dca.json");
    writeFileSync(file, JSON.stringify(schedule()));
    engine = await startTestEngine({
      strategies: true,
      allowedMints: [USDC],
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
  });

  afterAll(async () => {
    await engine?.stop();
    feed?.stop();
  });

  const env = () => {
    if (engine === undefined || feed === undefined) throw new Error("engine did not start");
    return callerEnv(engine, feed.url);
  };

  /** @param {string[]} args @param {Record<string, string>} [extra] */
  const solos = (args, extra = {}) => runSolos(args, { ...env(), ...extra }, FEATURES);

  test("register, list, pause, resume, cancel, and a second cancel is refused", async () => {
    const registered = await solos(["strategy", "register", "--file", file]);
    expect(registered.code).toBe(0);
    const body = JSON.parse(registered.stdout);
    expect(body).toEqual({ id: expect.any(String), state: "active" });
    const listed = JSON.parse((await solos(["strategy", "list"])).stdout);
    expect(listed.strategies.some((/** @type {{ id: string }} */ row) => row.id === body.id)).toBe(
      true,
    );
    for (const name of ["pause", "resume", "cancel"]) {
      expect((await solos(["strategy", name, body.id])).code).toBe(0);
    }
    const again = await solos(["strategy", "cancel", body.id]);
    expect(again.code).not.toBe(0);
    expect(stderrJson(again.stderr)?.error).toMatchObject({
      code: "StrategyTransitionRefused",
      from: "done",
      to: "done",
    });
    const preview = await runSolos(
      [
        "mcp",
        "call",
        "solana_strategy_simulate_update",
        "--args",
        JSON.stringify({ id: body.id, state: "active" }),
      ],
      env(),
    );
    expect(JSON.parse(preview.stdout).structuredContent).toMatchObject({
      allowed: false,
      state: "done",
    });
    const status = JSON.parse((await solos(["strategy", "status", body.id])).stdout);
    expect(status.state).toBe("done");
  });

  test("mcp execute_register returns the same JSON shape as the CLI", async () => {
    const cli = JSON.parse((await solos(["strategy", "register", "--file", file])).stdout);
    const mcp = await runSolos(
      ["mcp", "call", "solana_strategy_execute_register", "--args", JSON.stringify(schedule())],
      env(),
    );
    const structured = JSON.parse(mcp.stdout).structuredContent;
    expect(cli).toEqual({ id: expect.any(String), state: "active" });
    expect(structured).toEqual({ id: expect.any(String), state: "active" });
  });

  test("the simulate ceiling withholds execute_register and names its tier", async () => {
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_strategy_execute_register", "--args", "{}"],
      { ...env(), SOLOS_TOOL_TIER: "simulate" },
    );
    expect(code).not.toBe(0);
    const result = JSON.parse(stdout);
    expect(result.structuredContent.matches).toEqual([
      expect.objectContaining({
        name: "solana_strategy_execute_register",
        available: false,
        tier: "execute",
      }),
    ]);
  });

  test("simulate_register returns a first tick and leaves the registry unchanged", async () => {
    const before = JSON.parse((await solos(["strategy", "list"])).stdout).strategies.length;
    const scheduled = await runSolos(
      ["mcp", "call", "solana_strategy_simulate_register", "--args", JSON.stringify(schedule())],
      env(),
    );
    expect(JSON.parse(scheduled.stdout).structuredContent).toMatchObject({
      price: null,
      actions: [action],
    });
    const fired = await runSolos(
      ["mcp", "call", "solana_strategy_simulate_register", "--args", JSON.stringify(trigger())],
      env(),
    );
    expect(JSON.parse(fired.stdout).structuredContent).toMatchObject({
      price: { priceUsd: "150" },
      actions: [action],
    });
    const after = JSON.parse((await solos(["strategy", "list"])).stdout).strategies.length;
    expect(after).toBe(before);
  });
});

describe("`solos strategy` after an engine restart [integration]", () => {
  test("list still returns the strategy the CLI registered", async () => {
    const feed = prices();
    const dataDir = mkdtempSync(path.join(tmpdir(), "solos-strategy-restart-"));
    const file = path.join(dataDir, "dca.json");
    writeFileSync(file, JSON.stringify(schedule()));
    const first = await startTestEngine({
      strategies: true,
      allowedMints: [USDC],
      dataDir,
      keepData: true,
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
    const registered = await runSolos(
      ["strategy", "register", "--file", file],
      callerEnv(first, feed.url),
      FEATURES,
    );
    const id = JSON.parse(registered.stdout).id;
    await first.stop();
    const second = await startTestEngine({
      strategies: true,
      allowedMints: [USDC],
      dataDir,
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
    try {
      const listed = JSON.parse(
        (await runSolos(["strategy", "list"], callerEnv(second, feed.url), FEATURES)).stdout,
      );
      expect(listed.strategies.some((/** @type {{ id: string }} */ row) => row.id === id)).toBe(
        true,
      );
    } finally {
      await second.stop();
      feed.stop();
    }
  });
});

describe("strategy tools against an engine without the flag [integration]", () => {
  test("list_strategies returns EngineUnavailable naming STRATEGIES", async () => {
    const engine = await startTestEngine();
    try {
      const { stdout, code } = await runSolos(
        ["mcp", "call", "solana_strategy_list_strategies", "--args", "{}"],
        {
          SOLOS_ENGINE_URL: engine.url,
          SOLOS_ENGINE_TOKEN: engine.token,
          SOLOS_EXECUTOR: "engine",
          SOLANA_RPC_URL: engine.surfnet.rpcUrl,
          SOLANA_WS_URL: engine.surfnet.wsUrl,
          SOLOS_TOOLS: "all",
          SOLOS_LOG_LEVEL: "warn",
        },
      );
      expect(code).not.toBe(0);
      expect(JSON.parse(stdout).structuredContent.remedy).toContain("STRATEGIES");
      expect(JSON.parse(stdout).structuredContent.code).toBe("EngineUnavailable");
    } finally {
      await engine.stop();
    }
  });
});
