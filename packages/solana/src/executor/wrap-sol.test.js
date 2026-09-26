// @ts-check
/**
 * What a wrap emits, and — more importantly — what it refuses to emit.
 *
 * The dangerous mistakes here are wrapping when nobody asked, wrapping more than the quote is
 * short, and closing an account this transaction did not create. Each has its own case.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { WSOL_MINT, wrapForSides, wrapPlan } from "./wrap-sol.js";

const OWNER = "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f";
const ATA = "BqMR3NTtNd5qvsFUuBvSrn9zmjGnqhFxniQhjFAF4MFX";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const kit = /** @type {any} */ ({ signer: { address: OWNER } });

/** A token account holding `amount`, as the decoder reads it. */
const tokenBytes = (/** @type {bigint} */ amount) => {
  const bytes = new Uint8Array(165);
  new DataView(bytes.buffer).setBigUint64(64, amount, true);
  bytes[108] = 1; // initialized
  return bytes;
};

/** An RPC stub whose single account is either absent or holds `amount`. */
const ctxWith = (/** @type {bigint | null} */ amount) =>
  /** @type {any} */ ({
    url: "http://stub",
    rpc: {
      getMultipleAccounts: () => ({
        send: async () => ({
          value: [
            amount === null
              ? null
              : {
                  owner: TOKEN_PROGRAM,
                  data: [Buffer.from(tokenBytes(amount)).toString("base64"), "base64"],
                  lamports: 1n,
                  executable: false,
                  rentEpoch: 0n,
                  space: 165n,
                },
          ],
        }),
      }),
    },
  });

const run = (/** @type {any} */ effect) => Effect.runPromise(effect);

describe("wrapping native SOL for a funding side", () => {
  test("nothing is wrapped unless the caller asked", async () => {
    const wrap = await run(
      wrapPlan({
        ctx: ctxWith(null),
        kit,
        mint: WSOL_MINT,
        ata: ATA,
        required: 1_000_000n,
        wrapSol: false,
      }),
    );
    expect(wrap).toMatchObject({ covered: 0n });
    expect(wrap.prefix).toHaveLength(0);
    expect(wrap.suffix).toHaveLength(0);
  });

  test("a non-wSOL side is never wrapped, whatever the flag says", async () => {
    const wrap = await run(
      wrapPlan({ ctx: ctxWith(null), kit, mint: USDC, ata: ATA, required: 1n, wrapSol: true }),
    );
    expect(wrap.covered).toBe(0n);
  });

  test("a side that already holds enough is left alone", async () => {
    const wrap = await run(
      wrapPlan({
        ctx: ctxWith(5_000_000n),
        kit,
        mint: WSOL_MINT,
        ata: ATA,
        required: 1_000_000n,
        wrapSol: true,
      }),
    );
    expect(wrap.covered).toBe(0n);
    expect(wrap.prefix).toHaveLength(0);
  });

  test("an absent account is created, funded with exactly the shortfall, synced and closed", async () => {
    const wrap = await run(
      wrapPlan({
        ctx: ctxWith(null),
        kit,
        mint: WSOL_MINT,
        ata: ATA,
        required: 1_000_000n,
        wrapSol: true,
      }),
    );
    expect(wrap.covered).toBe(1_000_000n);
    expect(wrap.prefix).toHaveLength(3);
    // The close is what keeps the wallet where it started: rent and any unused lamports return.
    expect(wrap.suffix).toHaveLength(1);
  });

  test("a partly funded account is topped up by the difference, never the whole requirement", async () => {
    const wrap = await run(
      wrapPlan({
        ctx: ctxWith(400_000n),
        kit,
        mint: WSOL_MINT,
        ata: ATA,
        required: 1_000_000n,
        wrapSol: true,
      }),
    );
    expect(wrap.covered).toBe(600_000n);
  });

  test("a pre-existing account is topped up but never closed", async () => {
    const wrap = await run(
      wrapPlan({
        ctx: ctxWith(0n),
        kit,
        mint: WSOL_MINT,
        ata: ATA,
        required: 1_000_000n,
        wrapSol: true,
      }),
    );
    expect(wrap.covered).toBe(1_000_000n);
    // No create, because it exists; no close, because closing it would take rent that is the
    // caller's and an account they may be relying on.
    expect(wrap.prefix).toHaveLength(2);
    expect(wrap.suffix).toHaveLength(0);
  });

  test("a side needing nothing is not wrapped even when it is wSOL and absent", async () => {
    const wrap = await run(
      wrapPlan({ ctx: ctxWith(null), kit, mint: WSOL_MINT, ata: ATA, required: 0n, wrapSol: true }),
    );
    expect(wrap.covered).toBe(0n);
  });

  test("across a pair, only the wSOL side is wrapped", async () => {
    const wrap = await run(
      wrapForSides({
        ctx: ctxWith(null),
        kit,
        wrapSol: true,
        sides: [
          { mint: USDC, ata: ATA, required: 2_000_000n },
          { mint: WSOL_MINT, ata: ATA, required: 1_000_000n },
        ],
      }),
    );
    expect(wrap.covered).toBe(1_000_000n);
  });
});
