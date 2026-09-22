// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mintBytes } from "./liquidity-token-fixture.js";
import { positionAddress } from "./whirlpool-decode.js";
import { addressBytes, positionBytes, whirlpoolBytes } from "./whirlpool-fixture.js";
import { TOKEN_PROGRAM } from "./whirlpool-withdraw-instruction.js";
import { withdrawPlan } from "./whirlpool-withdraw-plan.js";

const POOL = "t45kYhVdVpTk5UxirScKYqs4rhuTFN6E1aDvb31x2km";
const POSITION_MINT = "3dwmUNom1FYMNRzA4cvVtJuhQzB8xuDQkcuHSUCbNh4j";
const POSITION = await positionAddress(POSITION_MINT);
const MINT_A = "4WtcLHrth8QJBcEkjWASfgwcb3ukij951vZpCQnP5gmz";
const MINT_B = "5PqTCCv2P1GEznVMQPQPT4yXm7eNUZ4jHEELxMFbnCYZ";
const VAULT_A = "79j8v32Hkkz8d8zYk9tH1q3N7F7bzCv3o6a9PgD5YBVV";
const VAULT_B = "82fymx5RSdr5SKF9R38DoD5HHJrDk2bGcXQBpig7JheQ";
const OWNER = "9nZfVnBgpPZy4fkLkoc7My97boqRAhdN5UAoP8eWHjdU";
const CUSTODY = "8ucpds8Z8Wi2FVVk5vNAab7CTNakeZkYEeYUWbZ4LwGh";
const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const row = (owner, bytes) => ({ owner, bytes });

/** A canned reader over one funded in-range position holding `liquidity` units. */
const cannedReader = (options = {}) => {
  const liquidity = options.liquidity ?? 10n ** 12n;
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
      liquidity,
      tickLowerIndex: -1000,
      tickUpperIndex: 1000,
    }),
  );
  const table = new Map(
    Object.entries({
      [POOL]: pool,
      [POSITION]: options.position === undefined ? position : options.position,
      [MINT_A]: row(TOKEN_PROGRAM, mintBytes(6)),
      [MINT_B]: row(TOKEN_PROGRAM, mintBytes(9)),
      ...options.rows,
    }),
  );
  return {
    liquidity,
    reader: {
      rows: (/** @type {readonly string[]} */ accounts) =>
        Effect.succeed(accounts.map((a) => table.get(a) ?? null)),
      custody: () => Effect.succeed(options.custody === undefined ? CUSTODY : options.custody),
    },
  };
};

const intent = { position: POSITION, bps: 10_000, maxSlippageBps: 50 };

/** @param {Parameters<typeof withdrawPlan>[0]} input @returns {Promise<import("./whirlpool-withdraw-plan.js").WithdrawPlan>} */
const runPlan = (input) => Effect.runPromise(withdrawPlan(input));

describe("the withdraw plan over a canned reader", () => {
  test("a funded position plans the full removal with bounded minimum receipts", async () => {
    const { reader, liquidity } = cannedReader();
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.liquidity).toBe(liquidity);
    expect(plan.minA).toBeLessThanOrEqual(plan.estA);
    expect(plan.minB).toBeLessThanOrEqual(plan.estB);
    expect(plan.estA > 0n || plan.estB > 0n).toBe(true);
    expect(plan.accounts.position).toBe(await positionAddress(POSITION_MINT));
    expect(plan.accounts.positionTokenAccount).toBe(CUSTODY);
    expect(plan.accounts.whirlpool).toBe(POOL);
    expect(plan.accounts.positionAuthority).toBe(OWNER);
    expect(plan.accounts.tokenVaultA).toBe(VAULT_A);
    expect(plan.accounts.tokenVaultB).toBe(VAULT_B);
    expect(plan.accounts.tickArrayLower).not.toBe(plan.accounts.tickArrayUpper);
    expect(plan.accounts.tokenOwnerAccountA).not.toBe(plan.accounts.tokenOwnerAccountB);
  });

  test("10000 bps removes exactly all current liquidity", async () => {
    const { reader } = cannedReader({ liquidity: 999_999n });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    if (plan.status !== "ok") throw new Error(plan.status);
    expect(plan.liquidity).toBe(999_999n);
  });

  test("1 bps floors the fraction; a sub-unit fraction is rejected", async () => {
    const { reader } = cannedReader({ liquidity: 12_345n });
    const one = await runPlan({ reader, action: { ...intent, bps: 1 }, owner: OWNER });
    expect(one.status).toBe("ok");
    if (one.status === "ok") expect(one.liquidity).toBe(1n);

    const dust = cannedReader({ liquidity: 5n });
    const zero = await runPlan({
      reader: dust.reader,
      action: { ...intent, bps: 1 },
      owner: OWNER,
    });
    expect(zero.status).toBe("reject");
    if (zero.status === "reject") expect(zero.reason).toContain("zero liquidity");
  });

  test("an empty position rejects before any instruction is derived", async () => {
    const { reader } = cannedReader({ liquidity: 0n });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("zero liquidity");
  });

  test("a missing position account is rejected", async () => {
    const { reader } = cannedReader({ position: null });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject")
      expect(plan.reason).toContain("no account at the position address");
  });

  test("a foreign-program position is rejected", async () => {
    const { liquidity } = cannedReader();
    const { reader } = cannedReader({
      position: row(
        TOKEN_2022,
        positionBytes({
          whirlpool: addressBytes(POOL),
          positionMint: addressBytes(POSITION_MINT),
          liquidity,
          tickLowerIndex: -1000,
          tickUpperIndex: 1000,
        }),
      ),
    });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject")
      expect(plan.reason).toContain("not owned by the pinned Whirlpool program");
  });

  test("a corrupt position layout is rejected", async () => {
    const liquidity = 10n ** 12n;
    const bytes = positionBytes({
      whirlpool: addressBytes(POOL),
      positionMint: addressBytes(POSITION_MINT),
      liquidity,
      tickLowerIndex: -1000,
      tickUpperIndex: 1000,
    });
    const { reader } = cannedReader({ position: row(WHIRLPOOL_PROGRAM, bytes.slice(0, 32)) });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("wrong layout");
  });

  test("a position referencing a missing pool is rejected", async () => {
    const { reader } = cannedReader({ rows: { [POOL]: null } });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("pool is missing");
  });

  test("absent NFT custody is rejected", async () => {
    const { reader } = cannedReader({ custody: null });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("does not hold the position NFT");
  });

  test("a position that is not its mint's PDA is rejected", async () => {
    const { liquidity } = cannedReader();
    const { reader } = cannedReader({
      position: row(
        WHIRLPOOL_PROGRAM,
        positionBytes({
          whirlpool: addressBytes(POOL),
          positionMint: addressBytes(MINT_B),
          liquidity,
          tickLowerIndex: -1000,
          tickUpperIndex: 1000,
        }),
      ),
    });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("not the derived PDA");
  });

  test("a token-2022 pool mint is rejected", async () => {
    const { reader } = cannedReader({ rows: { [MINT_A]: row(TOKEN_2022, mintBytes(6)) } });
    const plan = await runPlan({ reader, action: intent, owner: OWNER });
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("classic SPL");
  });
});
