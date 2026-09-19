import { describe, expect, test } from "bun:test";
import { ActionExecutor } from "@solos/core";
import { Effect, Exit } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomSeed } from "../surfnet/test-surfnet.js";

// No RPC is contacted: the executor refuses before building anything.
const layer = SolanaTestLive({
  rpcUrl: "http://127.0.0.1:1",
  wsUrl: "ws://127.0.0.1:2",
  seed: randomSeed(),
});

describe("DirectSignerExecutor", () => {
  test("names itself and refuses action types it cannot build", async () => {
    const program = Effect.gen(function* () {
      const executor = yield* ActionExecutor;
      const exit = yield* Effect.exit(
        executor.simulate({
          type: "close_perp",
          market: "SOL-PERP",
          traderPdaIndex: 0,
          traderSubaccountIndex: 0,
          limitPriceUsd: "100",
        }),
      );
      return { name: executor.name, exit };
    }).pipe(Effect.provide(layer));

    const { name, exit } = await Effect.runPromise(program);
    expect(name).toBe("direct-signer");
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("UnsupportedAction");
    expect(JSON.stringify(exit)).toContain("close_perp");
  });
});
