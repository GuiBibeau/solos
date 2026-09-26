// @ts-check
import { describe, expect, test } from "bun:test";
import { OPEN_POSITION } from "./action.fixtures.js";
import { ActionSchema } from "./action.js";
import { ExecutionResultSchema, VenueQuoteSchema } from "./results.js";

const POOL = OPEN_POSITION.pool;

describe("open_position meteora window", () => {
  test("the raydium fixture still parses equal", () => {
    expect(ActionSchema.parse(OPEN_POSITION)).toEqual(OPEN_POSITION);
  });

  test("a legal empty meteora open keeps the bin window and defaults wrapSol", () => {
    const parsed = ActionSchema.parse({
      type: "open_position",
      protocol: "meteora",
      pool: POOL,
      lowerBinId: -10,
      width: 5,
    });
    expect(parsed).toMatchObject({
      protocol: "meteora",
      pool: POOL,
      lowerBinId: -10,
      width: 5,
      wrapSol: false,
    });
    expect("tickLower" in parsed).toBe(false);
    expect("amountA" in parsed).toBe(false);
  });

  test("width 71 and a window past the last bin are refused, not clamped", () => {
    const wide = ActionSchema.safeParse({
      type: "open_position",
      protocol: "meteora",
      pool: POOL,
      lowerBinId: 0,
      width: 71,
    });
    expect(wide.success).toBe(false);
    if (!wide.success) expect(wide.error.issues[0]?.message).toContain("71");
    if (!wide.success) expect(wide.error.issues[0]?.message).toContain("not clamped");

    const past = ActionSchema.safeParse({
      type: "open_position",
      protocol: "meteora",
      pool: POOL,
      lowerBinId: 443_636,
      width: 2,
    });
    expect(past.success).toBe(false);
    if (!past.success) expect(past.error.issues[0]?.message).toContain("443637");
    if (!past.success) expect(past.error.issues[0]?.message).toContain("not clamped");
  });

  test("ticks on meteora and bins on raydium are refused", () => {
    const ticked = ActionSchema.safeParse({ ...OPEN_POSITION, protocol: "meteora" });
    expect(ticked.success).toBe(false);
    if (!ticked.success) expect(ticked.error.issues[0]?.message).toContain("lowerBinId");

    const binned = ActionSchema.safeParse({
      ...OPEN_POSITION,
      lowerBinId: 0,
      width: 1,
    });
    expect(binned.success).toBe(false);
    if (!binned.success) expect(binned.error.issues[0]?.message).toContain("lowerBinId");
  });

  test("quotes and execution results can name the meteora position account", () => {
    const quote = {
      kind: "meteora_position_open",
      pool: POOL,
      lowerBinId: -10,
      width: 5,
      position: POOL,
    };
    expect(VenueQuoteSchema.parse(quote)).toEqual(quote);
    const result = ExecutionResultSchema.parse({
      action: {
        type: "open_position",
        protocol: "meteora",
        pool: POOL,
        lowerBinId: -10,
        width: 5,
      },
      status: "confirmed",
      signature: "1".repeat(64),
      executedAt: 1,
      simulated: true,
      error: null,
      position: POOL,
    });
    expect(result.position).toBe(POOL);
  });
});
