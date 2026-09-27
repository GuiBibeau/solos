// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Exit, Option } from "effect";
import { JupiterSwapBuild, JupiterSwapBuildLive } from "./jupiter-swap-build-live.js";

/** Run one build through the live adapter and hand back its typed failure. */
const failureOf = async (config, params = {}) => {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const service = yield* JupiterSwapBuild;
      return yield* service.build(params);
    }).pipe(Effect.provide(JupiterSwapBuildLive(config))),
  );
  if (Exit.isSuccess(exit)) throw new Error("expected the build to fail");
  return Option.getOrThrow(Cause.failureOption(exit.cause));
};

const BASE = { baseUrl: "http://127.0.0.1:1" };

/** A build endpoint that rejects the credential. */
const rejected = async () => new Response("{}", { status: 401 });

describe("JupiterSwapBuildLive missing or rejected credential", () => {
  test("a missing key fails pre-HTTP and names where the key comes from", async () => {
    const failure = await failureOf(BASE);
    expect(failure).toMatchObject({ _tag: "BuildUnavailable" });
    expect(failure.reason).toContain("JUPITER_API_KEY is not set");
    expect(failure.remedy).toContain("portal.jup.ag");
  });

  test("a rejected key keeps its remedy when the build error is rewrapped", async () => {
    const failure = await failureOf({ ...BASE, apiKey: "price-only", fetchImpl: rejected });
    expect(failure).toMatchObject({
      _tag: "BuildUnavailable",
      reason: "Jupiter rejected the build credential with HTTP 401",
      remedy: "set JUPITER_API_KEY to a key with Swap access from https://portal.jup.ag",
    });
  });
});
