// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mintBytes } from "./liquidity-token-fixture.js";
import { positionAddress } from "./whirlpool-decode.js";
import { TOKEN_PROGRAM } from "./whirlpool-deposit-instruction.js";
import { depositPlan } from "./whirlpool-deposit-plan.js";
import {
  addressBytes,
  positionBytes,
  whirlpoolBytes,
  SQRT_PRICE_ONE,
} from "./whirlpool-fixture.js";

/** A deterministic-but-valid pool family for plan assertions. */
const POOL = "t45kYhVdVpTk5UxirScKYqs4rhuTFN6E1aDvb31x2km";
const POSITION = "2kzvcTkdKNgQZFjZPjgZ6vsnEvSXD5HkVKEkgXcofMwx";
const POSITION_MINT = "3dwmUNom1FYMNRzA4cvVtJuhQzB8xuDQkcuHSUCbNh4j";
const MINT_A = "4WtcLHrth8QJBcEkjWASfgwcb3ukij951vZpCQnP5gmz";
const MINT_B = "5PqTCCv2P1GEznVMQPQPT4yXm7eNUZ4jHEELxMFbnCYZ";
const VAULT_A = "79j8v32Hkkz8d8zYk9tH1q3N7F7bzCv3o6a9PgD5YBVV";
const VAULT_B = "82fymx5RSdr5SKF9R38DoD5HHJrDk2bGcXQBpig7JheQ";
const OWNER = "9nZfVnBgpPZy4fkLkoc7My97boqRAhdN5UAoP8eWHjdU";
const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const row = (owner, bytes) => ({ owner, bytes });

/**
 * A canned reader: rows by address (later overrides win), a custody flag, and a log of the
 * fetch batches so the two-phase read order stays observable. Reads succeed (never fail),
 * so the Effects are plain `Effect.succeed`.
 * @param {{ rows?: Record<string, { owner: string; bytes: Uint8Array } | null>; custody?: boolean }} [options]
 */
const cannedReader = (options = {}) => {
  const pool = row(
    WHIRLPOOL_PROGRAM,
    whirlpoolBytes({
      tokenMintA: addressBytes(MINT_A),
      tokenMintB: addressBytes(MINT_B),
      tokenVaultA: addressBytes(VAULT_A),
      tokenVaultB: addressBytes(VAULT_B),
    }),
  );
  const position = row(
    WHIRLPOOL_PROGRAM,
    positionBytes({
      whirlpool: addressBytes(POOL),
      positionMint: addressBytes(POSITION_MINT),
      liquidity: 0n,
      tickLowerIndex: -1000,
      tickUpperIndex: 1000,
    }),
  );
  const table = new Map(
    Object.entries({
      [POOL]: pool,
      [POSITION]: position,
      [MINT_A]: row(TOKEN_PROGRAM, mintBytes(6)),
      [MINT_B]: row(TOKEN_PROGRAM, mintBytes(9)),
      ...options.rows,
    }),
  );
  /** @type {string[][]} */
  const batches = [];
  return {
    batches,
    reader: {
      rows: (/** @type {readonly string[]} */ accounts) => {
        batches.push([...accounts]);
        return Effect.succeed(accounts.map((a) => table.get(a) ?? null));
      },
      custody: () => Effect.succeed(options.custody ?? true),
    },
  };
};

const intent = { pool: POOL, position: POSITION, amountA: 10n ** 9n, amountB: 10n ** 9n };

/** Run one plan effect to its value (tests may use run*). @param {Parameters<typeof depositPlan>[0]} input @returns {Promise<import("./whirlpool-deposit-plan.js").DepositPlan>} */
const runPlan = (input) => Effect.runPromise(depositPlan(input));

describe("the deposit plan over a canned reader", () => {
  test("an in-range empty position plans liquidity within both budgets", async () => {
    const { reader } = cannedReader();
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.liquidity).toBeGreaterThan(0n);
    expect(plan.requiredA).toBeLessThanOrEqual(intent.amountA);
    expect(plan.requiredB).toBeLessThanOrEqual(intent.amountB);
    expect(plan.tokenMaxA).toBe(intent.amountA);
    expect(plan.tokenMaxB).toBe(intent.amountB);
    expect(plan.accounts.position).toBe(await positionAddress(POSITION_MINT));
    expect(plan.accounts.whirlpool).toBe(POOL);
    expect(plan.accounts.tokenVaultA).toBe(VAULT_A);
    expect(plan.accounts.tokenVaultB).toBe(VAULT_B);
    expect(plan.accounts.tickArrayLower).not.toBe(plan.accounts.tickArrayUpper);
  });

  test("the reads are two batched calls: position+pool, then both mints", async () => {
    const { reader, batches } = cannedReader();
    await runPlan({ reader, action: intent, owner: OWNER });
    expect(batches).toEqual([
      [POSITION, POOL],
      [MINT_A, MINT_B],
    ]);
  });

  test("a position referencing another pool is rejected", async () => {
    const { reader } = cannedReader();
    const plan = await runPlan({
      reader,
      action: { ...intent, pool: MINT_B },
      owner: OWNER,
    });
    expect(plan.status).toBe("reject");
    if (plan.status !== "reject") return;
    expect(plan.reason).toContain("different pool");
  });

  test("a foreign-program mint is rejected with token-2022 named", async () => {
    const { reader } = cannedReader({
      rows: { [MINT_B]: row(TOKEN_2022, mintBytes(9)) },
    });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status !== "reject") return;
    expect(plan.reason).toContain("token-2022");
  });

  test("absent accounts fail the first guard that sees them", async () => {
    const missingPosition = cannedReader({ rows: { [POSITION]: null } });
    const noPosition = await runPlan({
      reader: missingPosition.reader,
      action: intent,
      owner: OWNER,
    });
    expect(noPosition.status).toBe("reject");
    if (noPosition.status !== "reject") return;
    expect(noPosition.reason).toContain("no account at the position address");

    const missingMint = cannedReader({ rows: { [MINT_A]: null } });
    const noMint = await runPlan({ reader: missingMint.reader, action: intent, owner: OWNER });
    expect(noMint.status).toBe("reject");
    if (noMint.status !== "reject") return;
    expect(noMint.reason).toContain("token A mint");

    const missingPool = cannedReader({ rows: { [POOL]: null } });
    const noPool = await runPlan({ reader: missingPool.reader, action: intent, owner: OWNER });
    expect(noPool.status).toBe("reject");
    if (noPool.status !== "reject") return;
    expect(noPool.reason).toContain("pool is missing");
  });

  test("a corrupt position body is rejected with its decode reason", async () => {
    const { reader } = cannedReader({
      rows: {
        [POSITION]: row(
          WHIRLPOOL_PROGRAM,
          positionBytes({
            whirlpool: addressBytes(POOL),
            positionMint: addressBytes(POSITION_MINT),
            tickLowerIndex: 5,
            tickUpperIndex: 5,
          }),
        ),
      },
    });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status !== "reject") return;
    expect(plan.reason).toContain("tick range is inverted");
  });

  test("denied custody is rejected before any quote math", async () => {
    const { reader } = cannedReader({ custody: false });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status !== "reject") return;
    expect(plan.reason).toContain("does not hold the position NFT");
  });

  test("zero-liquidity budgets are rejected, naming the zero outcome", async () => {
    const { reader } = cannedReader();
    const plan = await runPlan({
      reader,
      action: { ...intent, amountA: 0n },
      owner: OWNER,
    });
    expect(plan.status).toBe("reject");
    if (plan.status !== "reject") return;
    expect(plan.reason).toContain("zero liquidity");
  });

  test("the price constant aligns with the fixture pool default", () => {
    expect(SQRT_PRICE_ONE).toBe(1n << 64n);
  });
});
