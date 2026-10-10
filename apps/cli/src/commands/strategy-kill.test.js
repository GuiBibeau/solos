// @ts-check
import { describe, expect, test } from "bun:test";
import { startTestEngine } from "../../../engine/src/engine-fixture.js";
import { runSolos } from "./cli-fixture.js";

const FEATURES = { features: ["STRATEGIES"] };

/** @param {Awaited<ReturnType<typeof startTestEngine>>} engine */
const callerEnv = (engine) => ({
  SOLOS_ENGINE_URL: engine.url,
  SOLOS_ENGINE_TOKEN: engine.token,
  SOLOS_EXECUTOR: "engine",
  SOLANA_RPC_URL: engine.surfnet.rpcUrl,
  SOLANA_WS_URL: engine.surfnet.wsUrl,
  SOLOS_TOOL_TIER: "execute",
  SOLOS_TOOLS: "all",
  SOLOS_LOG_LEVEL: "warn",
});

describe("`solos strategy` kill switch [integration]", () => {
  test("engage, status, and disengage round-trip through the Engine", async () => {
    const engine = await startTestEngine({ strategies: true });
    try {
      const env = callerEnv(engine);
      const engaged = await runSolos(
        ["strategy", "kill", "--scope", "global", "--reason", "operator stop"],
        env,
        FEATURES,
      );
      expect(engaged.code).toBe(0);
      expect(JSON.parse(engaged.stdout)).toEqual({
        scope: "global",
        engaged: true,
        reason: "operator stop",
      });
      const status = await runSolos(
        ["strategy", "kill-status", "--scope", "global"],
        env,
        FEATURES,
      );
      expect(status.code).toBe(0);
      expect(JSON.parse(status.stdout).engaged).toBe(true);
      const lifted = await runSolos(["strategy", "disengage", "--scope", "global"], env, FEATURES);
      expect(lifted.code).toBe(0);
      expect(JSON.parse(lifted.stdout)).toEqual({ scope: "global", engaged: false, reason: null });
    } finally {
      await engine.stop();
    }
  }, 120_000);
});
