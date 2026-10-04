// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Option } from "effect";
import { resolveRpcUrl } from "./login-common.js";

const run = (
  /** @type {Option.Option<string>} */ flag,
  /** @type {{ env?: NodeJS.ProcessEnv; isTTY?: boolean }} */ io,
) => Effect.runSync(/** @type {Effect.Effect<string | undefined>} */ (resolveRpcUrl(flag, io)));

describe("the RPC URL a new profile stores", () => {
  test("the flag wins over everything", () => {
    const io = { env: { SOLANA_RPC_URL: "https://env.example" }, isTTY: true };
    expect(run(Option.some("https://flag.example"), io)).toBe("https://flag.example");
  });

  test("without the flag, SOLANA_RPC_URL from the environment is the answer", () => {
    expect(
      run(Option.none(), { env: { SOLANA_RPC_URL: "https://env.example" }, isTTY: false }),
    ).toBe("https://env.example");
    expect(
      run(Option.none(), { env: { SOLANA_RPC_URL: "https://env.example" }, isTTY: true }),
    ).toBe("https://env.example");
  });

  test("a blank env value is unset, and a non-TTY run with nothing stores nothing", () => {
    expect(run(Option.none(), { env: { SOLANA_RPC_URL: "" }, isTTY: false })).toBeUndefined();
    expect(run(Option.none(), { env: {}, isTTY: false })).toBeUndefined();
  });
});
