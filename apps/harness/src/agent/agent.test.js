import { beforeAll, describe, expect, test } from "bun:test";
import { EventBusInMemory, allTools } from "@solos/core";
import { SolanaTestLive } from "@solos/solana";
import { ensureSurfnet, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { MockLanguageModelV4 } from "ai/test";
import { Layer, ManagedRuntime } from "effect";
import { createSolosAgent } from "./create-agent.js";
import { groupIndex, toolsFromDefinitions } from "./tools-from-definitions.js";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** @param {Array<Record<string, unknown>>} content @param {"tool-calls" | "stop"} finish */
const step = (content, finish) => ({
  content,
  finishReason: { unified: finish, raw: finish },
  usage,
  warnings: [],
});

describe("harness agent loop [integration]", () => {
  /** @type {ManagedRuntime.ManagedRuntime<any, any>} */
  let runtime;
  /** @type {string} */
  let owner;

  beforeAll(async () => {
    const surfnet = await ensureSurfnet();
    const seed = randomSeed();
    owner = await seedAddress(seed);
    await surfnet.cheats.fundSol(owner, 3);
    runtime = ManagedRuntime.make(
      Layer.merge(SolanaTestLive({ ...surfnet, seed }), EventBusInMemory),
    );
  });

  test("calls the balance tool against Surfnet and answers", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        step(
          [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "solana_wallet_get_balance",
              input: "{}",
            },
          ],
          "tool-calls",
        ),
        step([{ type: "text", text: "Your wallet holds 3 SOL." }], "stop"),
      ],
    });
    const tools = toolsFromDefinitions(allTools, runtime);
    const agent = createSolosAgent({
      model,
      tools,
      groups: groupIndex(allTools),
      definitions: allTools,
      maxSteps: 5,
      activeGroups: ["wallet"],
    });

    const result = await agent.generate({ prompt: "What is my balance?" });

    expect(result.text).toBe("Your wallet holds 3 SOL.");
    const toolResults = result.steps.flatMap((s) => s.toolResults);
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]?.output).toMatchObject({ owner, sol: "3" });

    const firstCall = model.doGenerateCalls[0];
    const offered = (firstCall?.tools ?? []).map((t) => t.name);
    expect(offered).toEqual(["solana_wallet_get_address", "solana_wallet_get_balance"]);
    expect(firstCall?.prompt?.[0]?.content).toContain("solOS");
  });
});
