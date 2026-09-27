// @ts-check
/**
 * Opening a Raydium CLMM position at a range the caller supplies.
 *
 * Opening is the only solOS path that signs with **two** keys: the configured fee payer, and a
 * freshly generated mint for the position NFT. That keypair is created per transaction, used
 * once, and never stored — it exists only so the program can initialise the mint it is about to
 * hand to the owner. If the transaction fails, nothing is lost; if it lands, the position is
 * identified by its PDA, which the result carries so nothing has to be rediscovered from chain.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { decodePoolState } from "../liquidity/raydium-clmm-decode.js";
import {
  openPositionAccounts,
  openPositionData,
  raydiumOpenInstruction,
} from "../liquidity/raydium-clmm-open.js";
import { mintPrograms } from "../liquidity/raydium-clmm-plan-reads.js";
import { RAYDIUM_CLMM_PROGRAM } from "../liquidity/raydium-clmm-program.js";
import { spendBound } from "../liquidity/whirlpool-deposit-quote.js";
import { liquidityRead } from "./liquidity-token-accounts.js";
import { openFunding } from "./raydium-open-funding.js";
import { openParts } from "./raydium-open-parts.js";
import { openQuote, openSides } from "./raydium-open-quote.js";
import { notRaydium, raydiumDraft } from "./raydium-position-draft.js";
import { wrapForSides } from "./wrap-sol.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/** @param {string} reason */
/** @param {string} reason @param {string} [remedy] */
const rejected = (reason, remedy) =>
  new BuildRejected(remedy === undefined ? { reason } : { reason, remedy });

/**
 * Read and guard the pool an open targets. Unlike the other plans there is no position yet, so
 * only the pool is read.
 * @param {Rpc} ctx @param {string} pool
 */
const readPool = (ctx, pool) =>
  Effect.gen(function* () {
    const [row] = yield* fetchAccounts(liquidityRead(ctx), [pool]);
    if (row === null || row === undefined)
      return { ok: /** @type {const} */ (false), reason: "the pool was not found on chain" };
    if (row.owner !== RAYDIUM_CLMM_PROGRAM) {
      return {
        ok: /** @type {const} */ (false),
        reason: "the pool is not owned by the pinned Raydium CLMM program",
      };
    }
    const decoded = decodePoolState(row.bytes);
    if (decoded.status !== "decoded") {
      return { ok: /** @type {const} */ (false), reason: decoded.reason };
    }
    // Each side's account derives against its own mint's token program, so a Token-2022 pool
    // opens at the addresses the program expects rather than at classic ones it rejects.
    const programs = yield* mintPrograms(readerRows(ctx), decoded.layout);
    return "status" in programs
      ? { ok: /** @type {const} */ (false), reason: programs.reason }
      : { ok: /** @type {const} */ (true), pool: decoded.layout, programs };
  });

/** The plan reader's row seam, which is all `mintPrograms` needs. @param {Rpc} ctx */
const readerRows = (ctx) => ({
  rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(liquidityRead(ctx), accounts),
});

/**
 * The open instruction itself. The NFT mint signs through its own account meta — index 2 — which
 * is how Kit learns about the second signer without a separate list to keep in step.
 * @param {any} action
 * @param {{ liquidity: bigint; requiredA: bigint; requiredB: bigint }} quote
 * @param {Awaited<ReturnType<typeof openParts>>} built
 */
const openInstruction = (action, quote, built) =>
  raydiumOpenInstruction(
    openPositionAccounts({ ...built.accounts, nftMint: built.nftSigner.address }).map(
      (meta, index) => (index === 2 ? { ...meta, signer: built.nftSigner } : meta),
    ),
    openPositionData({
      tickLower: action.tickLower,
      tickUpper: action.tickUpper,
      startLower: built.startLower,
      startUpper: built.startUpper,
      liquidity: quote.liquidity,
      // Quoted spend plus the requested tolerance, capped by the budget: the budget alone would
      // make maxSlippageBps decorative on the one verb that opens a brand new position.
      amount0Max: spendBound(quote.requiredA, BigInt(action.amountA), action.maxSlippageBps),
      amount1Max: spendBound(quote.requiredB, BigInt(action.amountB), action.maxSlippageBps),
    }),
  );

/**
 * Every instruction an open needs, in the order it needs them: the wrap that funds a wSOL side,
 * the creates for a side the quote does not spend from, the open itself, and the unwrap of an
 * account this transaction created.
 * @param {{ ctx: Rpc; kit: Kit; action: any; quote: any;
 *   built: Awaited<ReturnType<typeof openParts>> }} parts
 */
const fundedOpen = ({ ctx, kit, action, quote, built }) =>
  Effect.gen(function* () {
    const wrap = yield* wrapForSides({
      ctx,
      kit,
      wrapSol: action.wrapSol === true,
      sides: openSides(built.accounts, quote),
    });
    const setup = yield* openFunding({
      read: liquidityRead(ctx),
      kit,
      quote,
      accounts: built.accounts,
      covered: wrap.covered,
    });
    return [...wrap.prefix, ...setup, openInstruction(action, quote, built), ...wrap.suffix];
  });

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {any} action */
export const draftRaydiumOpen = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "raydium") return yield* notRaydium("open_position", action.protocol);
    const read = yield* readPool(ctx, action.pool);
    if (!read.ok) return yield* rejected(read.reason);
    const quote = openQuote(action, read.pool);
    if (!quote.ok) return yield* rejected(quote.reason, quote.remedy);
    const built = yield* Effect.promise(() =>
      openParts({
        owner: kit.signer.address,
        action,
        pool: read.pool,
        programs: read.programs,
      }),
    );
    const funded = yield* fundedOpen({ ctx, kit, action, quote, built });
    return {
      draft: raydiumDraft("Raydium open", funded),
      plan: {
        position: built.accounts.personalPosition,
        nftMint: built.nftSigner.address,
        liquidity: quote.liquidity,
        requiredA: quote.requiredA,
        requiredB: quote.requiredB,
      },
    };
  }).pipe(Effect.withSpan("executor.buildRaydiumOpen"));
