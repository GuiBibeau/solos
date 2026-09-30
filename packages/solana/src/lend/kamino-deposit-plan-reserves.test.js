// @ts-check
import { describe, expect, test } from "bun:test";
import { address, getAddressEncoder, getBase58Codec } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { Effect } from "effect";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { vanillaObligationAddress } from "./kamino-deposit-addresses.js";
import { depositPlan } from "./kamino-deposit-plan.js";

const MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OWNER = "9y7uLMUMW6EiRwH1aJFSp9Zka7dVx2JdZKA3858u6YHT";
const RESERVE = "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const OTHER_ADDRESS = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T").toString();
const OTHER_RESERVE = getBase58Codec().decode(new Uint8Array(32).fill(1));

const intent = { market: MARKET, mint: MINT, amount: 1_000_000n, owner: OWNER };
const facts = {
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
};

/** A real SPL token-account row for the signer, funded. */
const ataRow = () => {
  const bytes = new Uint8Array(165);
  const encoder = getAddressEncoder();
  bytes.set(encoder.encode(address(MINT)), 0);
  bytes.set(encoder.encode(address(OWNER)), 32);
  new DataView(bytes.buffer).setBigUint64(64, 2_000_000n, true);
  return { owner: TOKEN_PROGRAM, bytes };
};

/** @param {string} reserve @param {bigint} amount */
const depositEntry = (reserve, amount) => ({
  depositReserve: reserve,
  depositedAmount: /** @type {any} */ ({ toString: () => amount.toString() }),
});

/** @param {Array<ReturnType<typeof depositEntry>>} deposits */
const rows = async (deposits) => {
  const ata = (
    await findAssociatedTokenPda({
      owner: address(OWNER),
      mint: address(MINT),
      tokenProgram: address(TOKEN_PROGRAM),
    })
  )[0].toString();
  const obligation = await vanillaObligationAddress(OWNER, MARKET);
  /** @type {Record<string, unknown>} */
  const byAddress = {
    [MINT]: { owner: TOKEN_PROGRAM, bytes: new Uint8Array(82) },
    [OTHER_ADDRESS]: { owner: TOKEN_PROGRAM, bytes: new Uint8Array(82) },
    [ata]: ataRow(),
    [obligation]: {
      owner: KLEND_PROGRAM_ID,
      state: { tag: 0, owner: OWNER, lendingMarket: MARKET, deposits, borrows: [] },
    },
  };
  return {
    rows: (/** @type {string[]} */ accounts) =>
      Effect.succeed(accounts.map((a) => byAddress[a] ?? null)),
    rent: () => Effect.succeed([0n]),
  };
};

describe("kamino deposit plan and other active reserves", () => {
  test("an obligation that already holds another reserve is refused, as withdraw refuses it", async () => {
    const reader = await rows([depositEntry(RESERVE, 1n), depositEntry(OTHER_RESERVE, 5n)]);
    const plan = await Effect.runPromise(
      depositPlan({ signer: /** @type {any} */ ({ address: OWNER }), reader, intent, facts }),
    );
    expect(plan).toMatchObject({
      status: "reject",
      reason: "the obligation has other active reserves requiring a separate refresh plan",
    });
  });

  test("a second reserve that is fully withdrawn does not block the deposit", async () => {
    const reader = await rows([depositEntry(RESERVE, 1n), depositEntry(OTHER_RESERVE, 0n)]);
    const plan = await Effect.runPromise(
      depositPlan({ signer: /** @type {any} */ ({ address: OWNER }), reader, intent, facts }),
    );
    expect(plan.status).toBe("ok");
  });
});
