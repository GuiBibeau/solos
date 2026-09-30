// @ts-check
import { describe, expect, test } from "bun:test";
import { address, getAddressEncoder } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { Cause, Effect, Option } from "effect";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { vanillaObligationAddress } from "./kamino-deposit-addresses.js";
import {
  depositPlan,
  OBLIGATION_ACCOUNT_SIZE,
  USER_METADATA_ACCOUNT_SIZE,
} from "./kamino-deposit-plan.js";

const MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OWNER = "9y7uLMUMW6EiRwH1aJFSp9Zka7dVx2JdZKA3858u6YHT";
const RESERVE = "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const OTHER_ADDRESS = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T").toString();

const intent = { market: MARKET, mint: MINT, amount: 1_000_000n, owner: OWNER };
const facts = () => ({
  reserve: RESERVE,
  liquidityMint: MINT,
  liquiditySupplyVault: OTHER_ADDRESS,
  liquidityTokenProgram: TOKEN_PROGRAM,
  collateralMint: OTHER_ADDRESS,
  collateralSupplyVault: OTHER_ADDRESS,
  lendingMarketAuthority: OTHER_ADDRESS,
  estimatedCollateral: "1001000",
  exchangeRate: "1.001",
  availableLiquidity: "1000000000000",
  oracles: {
    pythOracle: null,
    switchboardPriceOracle: null,
    switchboardTwapOracle: null,
    scopePrices: null,
  },
});

const addressEncoder = getAddressEncoder();

/** A real SPL token-account row: 165 bytes, mint at 0, owner at 32, u64 amount at 64. */
const ataRow = (tokenOwner, amount) => {
  const bytes = new Uint8Array(165);
  bytes.set(addressEncoder.encode(address(MINT)), 0);
  bytes.set(addressEncoder.encode(address(tokenOwner)), 32);
  new DataView(bytes.buffer).setBigUint64(64, amount, true);
  return { owner: TOKEN_PROGRAM, bytes };
};

/** A plain mint row of `size` bytes owned by `ownerProgram`. */
const mintRow = (ownerProgram, size = 82) => ({ owner: ownerProgram, bytes: new Uint8Array(size) });

/** A seam-decoded obligation row: plain values, the pinned state shape. */
const obligationRow = ({
  tag = 0,
  owner = OWNER,
  market = MARKET,
  deposits = [],
  borrows = [],
} = {}) => ({
  owner: KLEND_PROGRAM_ID,
  state: { tag, owner, lendingMarket: market, deposits, borrows },
});

const depositEntry = (reserve, amount) => ({
  depositReserve: reserve,
  depositedAmount: /** @type {any} */ ({ toString: () => amount.toString() }),
});

/** @param {Effect.Effect<unknown, unknown, never>} effect */
const runOf = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag === "Failure") {
    const failure = Cause.failureOption(exit.cause);
    if (Option.isSome(failure)) throw new Error(`unexpected effect failure: ${failure.value}`);
    throw new Error("unexpected defect");
  }
  return exit.value;
};

/** @param {Record<string, unknown>} rowsByAddress @param {bigint[]} [rents] */
const reader = (rowsByAddress, rents = [0n]) => ({
  rows: (accounts) =>
    Effect.promise(() => Promise.resolve(accounts.map((a) => rowsByAddress[a] ?? null))),
  rent: () => Effect.promise(() => Promise.resolve(rents)),
});

/** Rows keyed by the addresses the plan looks up: both mints plus extras by address. */
const rowsFor = (extras = {}) => {
  const f = facts();
  return {
    [f.liquidityMint]: mintRow(TOKEN_PROGRAM),
    [f.collateralMint]: mintRow(TOKEN_PROGRAM),
    ...extras,
  };
};

const sourceAta = async () =>
  (
    await findAssociatedTokenPda({
      owner: address(OWNER),
      mint: address(MINT),
      tokenProgram: address(TOKEN_PROGRAM),
    })
  )[0].toString();

describe("kamino deposit plan", () => {
  test("account sizes are the pinned program layouts", () => {
    expect(OBLIGATION_ACCOUNT_SIZE).toBe(3344);
    expect(USER_METADATA_ACCOUNT_SIZE).toBe(1032);
  });

  test("a fresh obligation plans user-metadata and obligation init before the deposit", async () => {
    const ata = await sourceAta();
    const plan = await runOf(
      depositPlan({
        signer: /** @type {any} */ ({ address: OWNER }),
        reader: reader(rowsFor({ [ata]: ataRow(OWNER, 2_000_000n) }), [1032n, 3344n]),
        intent,
        facts: facts(),
      }),
    );
    if (plan.status !== "ok") throw new Error(`expected ok: ${plan.reason}`);
    expect(plan.quote).toEqual({
      kind: "lend_deposit",
      reserve: RESERVE,
      obligation: plan.quote.obligation,
      liquidityAmount: "1000000",
      estimatedCollateral: "1001000",
      exchangeRate: "1.001",
      initializeObligation: true,
      rentLamports: "4376",
      feeLamports: "5000",
    });
    // initUserMetadata, initObligation, refreshReserve, refreshObligation, deposit
    expect(plan.instructions.length).toBe(5);
    for (const ix of plan.instructions) expect(ix.programAddress).toBe(KLEND_PROGRAM_ID);
  });

  test("an existing plain obligation in this reserve refreshes it and skips init", async () => {
    const ata = await sourceAta();
    const obligation = await vanillaObligationAddress(OWNER, MARKET);
    // One reserve only: an obligation holding a second reserve is refused until every listed
    // reserve can be refreshed in the same transaction (kamino-deposit-plan-reserves.test.js).
    const rows = rowsFor({
      [obligation]: obligationRow({ deposits: [depositEntry(RESERVE, 1n)] }),
      [ata]: ataRow(OWNER, 2_000_000n),
    });
    const plan = await runOf(
      depositPlan({
        signer: /** @type {any} */ ({ address: OWNER }),
        reader: reader(rows),
        intent,
        facts: facts(),
      }),
    );
    if (plan.status !== "ok") throw new Error(`expected ok: ${plan.reason}`);
    expect(plan.instructions.length).toBe(4);
    expect(plan.quote.initializeObligation).toBe(false);
    expect(plan.quote.rentLamports).toBe("0");
    // No initObligation: only user metadata initializes before the reserve refresh.
    expect(plan.instructions[1].data.length).toBeGreaterThan(0);
    // refreshObligation carries the deposit reserve, listed once, as a writable remaining account.
    const refresh = plan.instructions[2];
    const remaining = refresh.accounts.slice(2);
    expect(remaining.map((meta) => meta.address)).toEqual([RESERVE]);
    for (const meta of remaining) expect(meta.role).toBe(1);
  });

  test("an obligation with borrows, a foreign tag, foreign owner or foreign market is rejected", async () => {
    const ata = await sourceAta();
    const cases = [
      { borrows: [depositEntry(RESERVE, 5n)], reason: "borrows" },
      { tag: 1, reason: "plain supply obligation" },
      { owner: OTHER_ADDRESS, reason: "different owner" },
      { market: OTHER_ADDRESS, reason: "different market" },
    ];
    for (const state of cases) {
      const obligation = await vanillaObligationAddress(OWNER, MARKET);
      const rows = rowsFor({
        [obligation]: obligationRow(state),
        [ata]: ataRow(OWNER, 2_000_000n),
      });
      const plan = await runOf(
        depositPlan({
          signer: /** @type {any} */ ({ address: OWNER }),
          reader: reader(rows),
          intent,
          facts: facts(),
        }),
      );
      expect(plan.status).toBe("reject");
      if (plan.status === "reject") expect(plan.reason).toContain(state.reason);
    }
  });

  test("a kLend-owned obligation row that yields no decoded state is rejected, never dereferenced", async () => {
    const ata = await sourceAta();
    const obligation = await vanillaObligationAddress(OWNER, MARKET);
    const rows = rowsFor({
      [obligation]: { owner: KLEND_PROGRAM_ID, bytes: new Uint8Array(8) },
      [ata]: ataRow(OWNER, 2_000_000n),
    });
    const plan = await runOf(
      depositPlan({
        signer: /** @type {any} */ ({ address: OWNER }),
        reader: reader(rows),
        intent,
        facts: facts(),
      }),
    );
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") {
      expect(plan.reason).toContain("does not decode as a Kamino obligation");
    }
  });

  test("a missing or underfunded source token account is rejected without planning a send", async () => {
    const ata = await sourceAta();
    const short = await runOf(
      depositPlan({
        signer: /** @type {any} */ ({ address: OWNER }),
        reader: reader(rowsFor({ [ata]: ataRow(OWNER, 999_999n) })),
        intent,
        facts: facts(),
      }),
    );
    expect(short.status).toBe("reject");
    if (short.status === "reject") expect(short.reason).toContain("insufficient token balance");

    const missing = await runOf(
      depositPlan({
        signer: /** @type {any} */ ({ address: OWNER }),
        reader: reader(rowsFor()),
        intent,
        facts: facts(),
      }),
    );
    expect(missing.status).toBe("reject");
    if (missing.status === "reject") expect(missing.reason).toContain("does not exist");
  });

  test("unsupported mint programs and extensions are rejected", async () => {
    const ata = await sourceAta();
    const wrongMintProgram = await runOf(
      depositPlan({
        signer: /** @type {any} */ ({ address: OWNER }),
        reader: reader(rowsFor({ [ata]: ataRow(OWNER, 2_000_000n) })),
        intent,
        facts: { ...facts(), liquidityTokenProgram: TOKEN_2022_PROGRAM },
      }),
    );
    expect(wrongMintProgram.status).toBe("reject");
    if (wrongMintProgram.status === "reject") {
      expect(wrongMintProgram.reason).toContain("declared token program");
    }

    const extended = await runOf(
      depositPlan({
        reader: reader(
          rowsFor({ [MINT]: mintRow(TOKEN_2022_PROGRAM, 300), [ata]: ataRow(OWNER, 2_000_000n) }),
        ),
        intent,
        facts: { ...facts(), liquidityTokenProgram: TOKEN_2022_PROGRAM },
      }),
    );
    expect(extended.status).toBe("reject");
    if (extended.status === "reject") expect(extended.reason).toContain("extensions");

    const exoticCollateral = await runOf(
      depositPlan({
        reader: reader(
          rowsFor({
            [OTHER_ADDRESS]: { owner: OTHER_ADDRESS, bytes: new Uint8Array(82) },
            [ata]: ataRow(OWNER, 2_000_000n),
          }),
        ),
        intent,
        facts: facts(),
      }),
    );
    expect(exoticCollateral.status).toBe("reject");
    if (exoticCollateral.status === "reject") {
      expect(exoticCollateral.reason).toContain("collateral mint");
    }
  });
});
