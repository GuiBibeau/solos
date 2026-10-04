// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Exit, Option } from "effect";
import { resolveRpcUrl } from "./login-common.js";

/** @param {Option.Option<string>} flag @param {{ env?: NodeJS.ProcessEnv; isTTY?: boolean }} io */
const run = (flag, io) =>
  Effect.runSync(
    /** @type {Effect.Effect<string | undefined>} */ (
      /** @type {unknown} */ (resolveRpcUrl(flag, io))
    ),
  );

/** @param {Option.Option<string>} flag @param {{ env?: NodeJS.ProcessEnv; isTTY?: boolean }} io */
const runExit = (flag, io) =>
  Effect.runSyncExit(
    /** @type {Effect.Effect<string | undefined, { _tag: string; field: string; value: unknown; remedy?: string }>} */ (
      /** @type {unknown} */ (resolveRpcUrl(flag, io))
    ),
  );

const tty = { env: {}, isTTY: true };

describe("the RPC URL a new profile stores", () => {
  test("the flag wins over everything when it passes the profile's rule", () => {
    const io = { env: { SOLANA_RPC_URL: "https://env.example" }, isTTY: true };
    expect(run(Option.some("https://flag.example"), io)).toBe("https://flag.example");
    const loopback = "http://127.0.0.1:8899";
    expect(run(Option.some(loopback), tty)).toBe(loopback);
  });

  test("a flag the profile cannot store fails before any provider flow, origin only", () => {
    // eslint-disable-next-line unicorn/prefer-https -- rejecting remote http is the point
    const remoteWithKey = "http://remote.example/key-123?token=abc";
    const exit = runExit(Option.some(remoteWithKey), tty);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("ValidationError");
      expect(exit.cause.error.field).toBe("rpcUrl");
      expect(exit.cause.error.value).toBe(new URL(remoteWithKey).origin);
      expect(exit.cause.error.remedy).toContain("https");
    }
  });

  test("without the flag, a storable SOLANA_RPC_URL from the environment is the answer", () => {
    const env = { SOLANA_RPC_URL: "https://env.example" };
    expect(run(Option.none(), { env, isTTY: false })).toBe("https://env.example");
    expect(run(Option.none(), { env, isTTY: true })).toBe("https://env.example");
  });

  test("an env URL the profile cannot store, a blank one, or none: nothing stored off a TTY", () => {
    // eslint-disable-next-line unicorn/prefer-https -- rejecting remote http is the point
    const remote = { SOLANA_RPC_URL: "http://remote.example" };
    expect(run(Option.none(), { env: remote, isTTY: false })).toBeUndefined();
    expect(run(Option.none(), { env: { SOLANA_RPC_URL: "" }, isTTY: false })).toBeUndefined();
    expect(run(Option.none(), { env: {}, isTTY: false })).toBeUndefined();
  });
});
