// @ts-check
import { describe, expect, test } from "bun:test";
import { STRATEGY_STATES } from "@solos-sh/actions";
import { StrategyTransitionRefused } from "./errors.js";
import { refusalFor } from "./transitions.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ACTORS = ["caller", "engine"];

const pairs = ACTORS.flatMap((actor) =>
  STRATEGY_STATES.flatMap((from) =>
    STRATEGY_STATES.map((to) => /** @type {const} */ ([actor, from, to])),
  ),
);

describe("strategy state table", () => {
  test("every allowed transition succeeds and every other pair is refused with from and to", () => {
    /** @type {Array<readonly [string, string, string]>} */
    const allowed = [];
    for (const [actor, from, to] of pairs) {
      const refusal = refusalFor({ id: ID, from, to, actor });
      if (refusal === undefined) {
        allowed.push([actor, from, to]);
        continue;
      }
      expect(refusal).toBeInstanceOf(StrategyTransitionRefused);
      expect(refusal.from).toBe(from);
      expect(refusal.to).toBe(to);
    }
    expect(allowed).toEqual([
      ["caller", "active", "paused"],
      ["caller", "active", "done"],
      ["caller", "paused", "active"],
      ["caller", "paused", "done"],
      ["engine", "active", "paused"],
      ["engine", "active", "done"],
      ["engine", "active", "expired"],
      ["engine", "active", "failed"],
    ]);
  });
});
