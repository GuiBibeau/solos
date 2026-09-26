// @ts-check
/**
 * The two rules that decide a funding side, over values rather than a chain.
 *
 * `wrapShortfall` says how much native SOL to wrap; `fundingSide` says what the transaction must
 * carry for that side. Both are pure over a fetched row, so the adapter that reads them is
 * exercised on Surfpool (`raydium-lifecycle-surfnet.test.js`) and the rules themselves here.
 *
 * The dangerous mistakes are wrapping when nobody asked, wrapping more than the quote is short,
 * closing an account this transaction did not create, and — the one that fails on chain rather
 * than in a guard — forgetting to create a side the quote spends nothing from. Both venues list
 * both token accounts on the instruction whatever the range covers.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { fundingSide } from "./liquidity-token-accounts.js";
import { WSOL_MINT, wrapInstructions, wrapShortfall } from "./wrap-sol.js";

const OWNER = "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f";
const ATA = "BqMR3NTtNd5qvsFUuBvSrn9zmjGnqhFxniQhjFAF4MFX";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const kit = /** @type {any} */ ({ signer: { address: OWNER } });

const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/** The ATA program's create opcodes: 0 is plain create, 1 is createIdempotent. */
const opcodeOf = (/** @type {any} */ ix) => ix.data?.[0];

/** A fetched row holding `amount`, as the token decoder reads it. */
const rowHolding = (/** @type {bigint} */ amount) => {
  const bytes = new Uint8Array(165);
  new DataView(bytes.buffer).setBigUint64(64, amount, true);
  bytes[108] = 1;
  return { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", bytes };
};

/** @param {any} side */
const setupFor = (side) =>
  Effect.runSync(
    Effect.either(
      fundingSide({ kit, mint: WSOL_MINT, ata: ATA, label: "A", verb: "deposit", ...side }),
    ),
  );

describe("how much native SOL a side needs wrapped", () => {
  test("nothing is wrapped unless the caller asked", () => {
    expect(wrapShortfall({ mint: WSOL_MINT, required: 1_000_000n, held: 0n, wrapSol: false })).toBe(
      0n,
    );
  });

  test("a non-wSOL side is never wrapped, whatever the flag says", () => {
    expect(wrapShortfall({ mint: USDC, required: 1_000_000n, held: 0n, wrapSol: true })).toBe(0n);
  });

  test("a side owed nothing is never wrapped, even when it is wSOL", () => {
    expect(wrapShortfall({ mint: WSOL_MINT, required: 0n, held: 0n, wrapSol: true })).toBe(0n);
  });

  test("a side already holding enough is left alone", () => {
    expect(
      wrapShortfall({ mint: WSOL_MINT, required: 1_000_000n, held: 5_000_000n, wrapSol: true }),
    ).toBe(0n);
  });

  test("exactly the shortfall is wrapped, never the whole requirement", () => {
    expect(
      wrapShortfall({ mint: WSOL_MINT, required: 1_000_000n, held: 400_000n, wrapSol: true }),
    ).toBe(600_000n);
  });

  test("an empty side wraps the whole requirement", () => {
    expect(wrapShortfall({ mint: WSOL_MINT, required: 1_000_000n, held: 0n, wrapSol: true })).toBe(
      1_000_000n,
    );
  });
});

describe("the instructions a wrap emits", () => {
  test("an account this transaction creates is created plainly, never idempotently", () => {
    const wrap = wrapInstructions({ kit, ata: ATA, lamports: 1_000_000n, isAbsent: true });
    const create = /** @type {any} */ (wrap.prefix[0]);
    expect(create.programAddress).toBe(ATA_PROGRAM);
    // Idempotent (opcode 1) would no-op against an account that appeared after the preflight
    // read, while the close below still ran — unwrapping a balance this transaction never put
    // there. A plain create (opcode 0) makes a lost race abort the whole transaction instead.
    expect(opcodeOf(create)).toBe(0);
    expect(wrap.suffix).toHaveLength(1);
  });

  test("an account that already exists is topped up and never closed", () => {
    const wrap = wrapInstructions({ kit, ata: ATA, lamports: 1_000_000n, isAbsent: false });
    expect(wrap.prefix).toHaveLength(2);
    expect(wrap.prefix.some((/** @type {any} */ ix) => ix.programAddress === ATA_PROGRAM)).toBe(
      false,
    );
    expect(wrap.suffix).toHaveLength(0);
  });
});

describe("what a funding side puts in the transaction", () => {
  test("a side owed nothing whose account is absent is still created", () => {
    // Both venues list both token accounts whatever the range covers, so skipping this create
    // fails on chain with AccountNotInitialized rather than in any guard.
    const setup = setupFor({ row: null, required: 0n });
    expect(setup._tag).toBe("Right");
    expect(setup._tag === "Right" && setup.right).not.toBeNull();
  });

  test("a side owed nothing whose account exists needs no instruction", () => {
    const setup = setupFor({ row: rowHolding(0n), required: 0n });
    expect(setup._tag === "Right" && setup.right).toBeNull();
  });

  test("a side that already covers the spend needs no instruction", () => {
    const setup = setupFor({ row: rowHolding(5_000_000n), required: 1_000_000n });
    expect(setup._tag === "Right" && setup.right).toBeNull();
  });

  test("a wrap that covers an absent side satisfies it without a separate create", () => {
    // The wrap's own create is already in the transaction; a second one would be redundant.
    const setup = setupFor({ row: null, required: 1_000_000n, covered: 1_000_000n });
    expect(setup._tag === "Right" && setup.right).toBeNull();
  });

  test("a short side is refused with the balance it actually has", () => {
    const setup = setupFor({ row: rowHolding(400_000n), required: 1_000_000n });
    expect(setup._tag).toBe("Left");
    expect(setup._tag === "Left" && setup.left.reason).toContain("400000 available");
  });

  test("an absent side that is owed something is refused by name", () => {
    const setup = setupFor({ row: null, required: 1_000_000n });
    expect(setup._tag).toBe("Left");
    expect(setup._tag === "Left" && setup.left.reason).toContain("does not exist");
  });
});
