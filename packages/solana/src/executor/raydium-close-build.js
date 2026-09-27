// @ts-check
/**
 * Closing a Raydium CLMM position and reclaiming its rent.
 *
 * The program refuses while any liquidity, fee or reward is still owed. A full removal already
 * sweeps fees and rewards, so the only precondition worth naming here is the liquidity, which the
 * guard reports plainly rather than letting the simulation surface a bare custom error.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
import {
  closePositionAccounts,
  closePositionData,
  raydiumOpenInstruction,
} from "../liquidity/raydium-clmm-open.js";
import { positionNftProgram, prepareRaydiumPlan } from "../liquidity/raydium-clmm-plan-reads.js";
import { liquidityRead } from "./liquidity-token-accounts.js";
import { notRaydium, signRaydiumPosition } from "./raydium-position-sign.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {any} action */
export const buildSignedRaydiumClose = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "raydium") return yield* notRaydium("close_position", action.protocol);
    const owner = kit.signer.address;
    const read = liquidityRead(ctx);
    const reader = {
      rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(read, accounts),
      custody: (/** @type {string} */ mint) => positionNftAccount(read, owner, mint),
    };
    const prepared = yield* prepareRaydiumPlan(reader, action.position);
    if (prepared.status === "reject") return yield* new BuildRejected({ reason: prepared.reason });
    if (prepared.position.liquidity > 0n) {
      return yield* new BuildRejected({
        reason: `the position still holds ${prepared.position.liquidity} liquidity; remove it all first`,
        remedy: "call solana_liquidity_execute_withdraw to remove all liquidity, then close",
      });
    }
    // Which token program holds the NFT depends on which open instruction created the position,
    // and a position solOS did not open is usually the classic one. Reading it is the difference
    // between closing any empty position and closing only the ones solOS opened itself.
    const nft = yield* positionNftProgram(reader, prepared.nftAccount);
    if ("status" in nft) return yield* new BuildRejected({ reason: nft.reason });
    const instruction = raydiumOpenInstruction(
      closePositionAccounts({
        nftOwner: owner,
        nftMint: prepared.position.nftMint,
        nftAccount: prepared.nftAccount,
        personalPosition: action.position,
        nftProgram: nft.program,
      }),
      closePositionData(),
    );
    const signed = yield* signRaydiumPosition({ ctx, kit, instructions: [instruction] });
    return { signed, plan: { position: action.position, nftMint: prepared.position.nftMint } };
  }).pipe(Effect.withSpan("executor.buildRaydiumClose"));
