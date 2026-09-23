// @ts-check
import { describe, expect, test } from "bun:test";
import { address, getAddressEncoder, getBase58Codec } from "@solana/kit";
import { Effect } from "effect";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { associatedTokenAccount, vanillaObligationAddress } from "./kamino-deposit-addresses.js";
import { kaminoDepositSdk } from "./kamino-deposit-facts.js";
import { depositPlan } from "./kamino-deposit-plan.js";
import { farmUserAddress, FARMS_PROGRAM_ID } from "./kamino-farm-instructions.js";
import { refreshReserveInstruction } from "./kamino-refresh-reserve.js";
import { withdrawPlan } from "./kamino-withdraw-plan.js";

const addr = (byte) => getBase58Codec().decode(new Uint8Array(32).fill(byte));
const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const intent = { owner: addr(1), market: addr(2), mint: addr(3), amount: 1_000_000n };
const farm = addr(10);
const facts = {
  reserve: addr(4),
  liquidityMint: intent.mint,
  liquiditySupplyVault: addr(5),
  collateralMint: addr(6),
  collateralSupplyVault: addr(7),
  lendingMarketAuthority: addr(8),
  liquidityTokenProgram: tokenProgram,
  farmCollateral: farm,
  estimatedCollateral: "1000000",
  exchangeRate: "1",
  availableLiquidity: "10000000",
  oracles: {
    pythOracle: null,
    switchboardPriceOracle: null,
    switchboardTwapOracle: null,
    scopePrices: null,
  },
};
const mintRow = { owner: tokenProgram, bytes: new Uint8Array(82) };
const tokenRow = (amount) => {
  const bytes = new Uint8Array(165);
  bytes.set(getAddressEncoder().encode(address(intent.mint)), 0);
  bytes.set(getAddressEncoder().encode(address(intent.owner)), 32);
  new DataView(bytes.buffer).setBigUint64(64, amount, true);
  return { owner: tokenProgram, bytes };
};
const obligationRow = {
  owner: KLEND_PROGRAM_ID,
  state: {
    owner: intent.owner,
    lendingMarket: intent.market,
    tag: 0,
    borrows: [],
    deposits: [{ depositReserve: facts.reserve, depositedAmount: 2_000_000n }],
  },
};
const read = (rows) => ({
  rows: (accounts) => Effect.succeed(accounts.map((account) => rows[account] ?? null)),
  rent: (sizes) => Effect.succeed(sizes.map(BigInt)),
});
const planSetup = async (userState = null, farmRow = undefined) => {
  const sdk = await kaminoDepositSdk();
  const obligation = await vanillaObligationAddress(intent.owner, intent.market);
  const farmUser = await farmUserAddress(sdk, farm, obligation);
  if (!farmUser) throw new Error("expected collateral farm PDA");
  const source = await associatedTokenAccount(intent.owner, intent.mint, tokenProgram);
  const rows = {
    [facts.liquidityMint]: mintRow,
    [facts.collateralMint]: mintRow,
    [source]: tokenRow(2_000_000n),
    [farm]: farmRow === undefined ? { owner: FARMS_PROGRAM_ID } : farmRow,
    [farmUser]: userState,
  };
  return { rows, farmUser, obligation };
};
const signer = /** @type {any} */ ({ address: intent.owner });

describe("Kamino farm plans [integration]", () => {
  test("fresh deposit initializes farm, refreshes it on both sides, and includes rent", async () => {
    const { rows, farmUser } = await planSetup();
    const plan = await Effect.runPromise(
      depositPlan({ reader: read(rows), intent, facts, signer }),
    );
    if (plan.status !== "ok") throw new Error(plan.reason);
    expect(plan.instructions).toHaveLength(8);
    expect(plan.quote.rentLamports).toBe("5296");
    const sdk = await kaminoDepositSdk();
    const reserveRefresh = refreshReserveInstruction(sdk, {
      market: intent.market,
      reserve: facts.reserve,
      oracles: facts.oracles,
    });
    // The protocol requires the three refreshes contiguous immediately before the combined ix.
    expect(plan.instructions[3].data).toEqual(reserveRefresh.data);
    for (const index of [2, 5, 7])
      expect(plan.instructions[index].accounts.map((a) => a.address)).toContain(farmUser);
  });

  test("existing collateral farm state is reused, never initialized again", async () => {
    const { rows } = await planSetup({ owner: FARMS_PROGRAM_ID });
    const plan = await Effect.runPromise(
      depositPlan({ reader: read(rows), intent, facts, signer }),
    );
    if (plan.status !== "ok") throw new Error(plan.reason);
    expect(plan.instructions).toHaveLength(7);
    expect(plan.quote.rentLamports).toBe("4376");
  });

  test("farm missing from RPC rejects a deposit instead of constructing unsafe instructions", async () => {
    const { rows } = await planSetup(null, null);
    const plan = await Effect.runPromise(
      depositPlan({ reader: read(rows), intent, facts, signer }),
    );
    expect(plan.status).toBe("reject");
    if (plan.status === "reject") expect(plan.reason).toContain("collateral farm is missing");
  });

  test("withdrawal initializes a missing farm user state, refreshes before and after redemption", async () => {
    const { rows, obligation, farmUser } = await planSetup();
    const destination = await associatedTokenAccount(intent.owner, intent.mint, tokenProgram);
    const plan = await Effect.runPromise(
      withdrawPlan({
        reader: read({ ...rows, [obligation]: obligationRow, [destination]: tokenRow(0n) }),
        intent,
        facts,
        signer,
      }),
    );
    if (plan.status !== "ok") throw new Error(plan.reason);
    expect(plan.instructions).toHaveLength(6);
    expect(plan.quote.rentLamports).toBe("920");
    for (const index of [0, 3, 5])
      expect(plan.instructions[index].accounts.map((a) => a.address)).toContain(farmUser);
  });

  test("withdrawal with existing farm state refreshes without init or rent", async () => {
    const { rows, obligation } = await planSetup({ owner: FARMS_PROGRAM_ID });
    const destination = await associatedTokenAccount(intent.owner, intent.mint, tokenProgram);
    const plan = await Effect.runPromise(
      withdrawPlan({
        reader: read({ ...rows, [obligation]: obligationRow, [destination]: tokenRow(0n) }),
        intent,
        facts,
        signer,
      }),
    );
    if (plan.status !== "ok") throw new Error(plan.reason);
    expect(plan.instructions).toHaveLength(5);
    expect(plan.quote.rentLamports).toBe("0");
  });
});
