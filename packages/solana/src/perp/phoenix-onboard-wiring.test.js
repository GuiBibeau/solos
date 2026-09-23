// @ts-check
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ActionExecutor, getOnboardingStatus, simulateOnboardTrader } from "@solos/core";
import { Effect, Exit } from "effect";
import { SolanaTestLive } from "../index.js";
import { ensureSurfnet } from "../surfnet/index.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";

// Static gate: a regression must stop this suite before fixture-backed simulation
// could POST a partially signed transaction to the production Phoenix API.
const assertIsolatedTestWiring = () => {
  const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const testLayer = source.split("export const SolanaTestLive =", 2)[1];
  expect(testLayer).toMatch(
    /adapters\(\{\s*market: kamino\?\.market,\s*phoenix: testPhoenix\s*\}\)/,
  );
  expect(testLayer).toContain("Layer.merge(perp(testPhoenix))");
};

test(
  "Phoenix onboarding test-layer routing [integration] shares its isolated config with both status and executor",
  assertIsolatedTestWiring,
);

test("Phoenix onboarding test-layer routing [integration] sends status and build only to the loopback fixture", async () => {
  assertIsolatedTestWiring();
  const surfnet = await ensureSurfnet();
  const fixture = startPhoenixFixture({ traderStatus: 404 });
  try {
    const layer = SolanaTestLive({
      ...surfnet,
      seed: randomSeed(),
      phoenix: { baseUrl: fixture.url },
    });
    const status = await Effect.runPromise(getOnboardingStatus().pipe(Effect.provide(layer)));
    expect(status.state).toBe("unregistered");
    const exit = await Effect.runPromiseExit(simulateOnboardTrader().pipe(Effect.provide(layer)));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("BuildUnavailable");
    const execute = Effect.flatMap(ActionExecutor, (executor) =>
      executor.execute(
        { type: "onboard_perp", traderPdaIndex: 0, traderSubaccountIndex: 0 },
        { skipSimulation: false },
      ),
    );
    const executeExit = await Effect.runPromiseExit(execute.pipe(Effect.provide(layer)));
    expect(Exit.isFailure(executeExit)).toBe(true);
    expect(JSON.stringify(executeExit)).toContain("BuildUnavailable");
    const paths = fixture.requests.map(({ path }) => path);
    expect(paths.filter((path) => path.startsWith("/v1/trader/state/"))).toHaveLength(2);
    expect(paths.filter((path) => path === "/v1/exchange/build-register-ixs")).toHaveLength(2);
    expect(paths).not.toContain("/v1/exchange/send-register-ixs");
  } finally {
    fixture.stop();
  }
});
