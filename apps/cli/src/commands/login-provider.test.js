// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Exit, Option } from "effect";
import { resolveProvider } from "./login-common.js";

describe("which wallet provider login uses", () => {
  test("the flag wins", () => {
    const effect = /** @type {Effect.Effect<string>} */ (
      /** @type {unknown} */ (resolveProvider(Option.some("privy"), { isTTY: true }))
    );
    expect(Effect.runSync(effect)).toBe("privy");
  });

  test("without a flag and without a terminal, it fails with a remedy naming the flag", () => {
    const exit = Effect.runSyncExit(
      /** @type {Effect.Effect<string, { _tag: string; field: string; remedy?: string }>} */ (
        /** @type {unknown} */ (resolveProvider(Option.none(), { isTTY: false }))
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("ValidationError");
      expect(exit.cause.error.field).toBe("provider");
      expect(exit.cause.error.remedy).toContain("--provider");
    }
  });
});
