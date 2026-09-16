import { describe, expect, test } from "bun:test";
import { Store } from "@solos/core";
import { Effect, Option } from "effect";
import { StoreSqlite } from "./sqlite-store.js";

describe("sqlite store", () => {
  test("round-trips namespaced JSON values", async () => {
    const program = Effect.gen(function* () {
      const store = yield* Store;
      yield* store.set("positions", "SOL", { size: "1.5" });
      yield* store.set("positions", "USDC", { size: "10" });
      yield* store.set("other", "x", 1);
      const hit = yield* store.get("positions", "SOL");
      const miss = yield* store.get("positions", "nope");
      const listed = yield* store.list("positions");
      yield* store.remove("positions", "SOL");
      const afterRemove = yield* store.list("positions");
      return { hit, miss, listed, afterRemove };
    }).pipe(Effect.scoped, Effect.provide(StoreSqlite(":memory:")));

    const result = await Effect.runPromise(program);
    expect(Option.getOrNull(result.hit)).toEqual({ size: "1.5" });
    expect(Option.isNone(result.miss)).toBe(true);
    expect(result.listed).toEqual([
      { key: "SOL", value: { size: "1.5" } },
      { key: "USDC", value: { size: "10" } },
    ]);
    expect(result.afterRemove).toEqual([{ key: "USDC", value: { size: "10" } }]);
  });
});
