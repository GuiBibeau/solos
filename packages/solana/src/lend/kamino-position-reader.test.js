// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Option } from "effect";
import { ownerObligations } from "./kamino-position-reader.js";

const MARKET = "7u3E9eLCHaapLe2p8qSj4wePkBdtWTBQdMvPf6VgN7bD";
const OWNER = "EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih";

describe("Kamino obligation scan failures", () => {
  test("maps a rejected program-account request to a redacted RpcError", async () => {
    const rpc = {
      getProgramAccounts: () => ({ send: () => Promise.reject(new Error("secret body")) }),
    };
    const exit = await Effect.runPromiseExit(
      ownerObligations(/** @type {any} */ (rpc), {
        market: MARKET,
        owner: OWNER,
        origin: "https://rpc.example",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (Option.isSome(failure)) {
      expect(failure.value).toMatchObject({
        _tag: "RpcError",
        method: "getProgramAccounts",
        url: "https://rpc.example",
        reason: "the configured RPC endpoint failed the obligation scan",
      });
      expect(JSON.stringify(failure.value)).not.toContain("secret body");
    }
  });
});
