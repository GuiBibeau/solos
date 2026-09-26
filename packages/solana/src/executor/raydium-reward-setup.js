// @ts-check
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { createAta, liquidityRead } from "./liquidity-token-accounts.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/**
 * The reward recipients a removal sweeps into. `decrease_liquidity_v2` takes one per initialized
 * pool reward whatever is owed, and the program requires each to exist — so a wallet that has
 * never held that reward token needs its account created in the same transaction, or the
 * removal fails on chain and the position cannot be exited.
 * @param {{ ctx: Rpc; kit: Kit; rewards: ReadonlyArray<{ recipient: string; mint: string; program: string }> }} parts
 */
export const rewardSetup = ({ ctx, kit, rewards }) =>
  Effect.gen(function* () {
    if (rewards.length === 0) return [];
    const rows = yield* fetchAccounts(
      liquidityRead(ctx),
      rewards.map((reward) => reward.recipient),
    );
    return rewards
      .filter((_, index) => rows[index] === null || rows[index] === undefined)
      .map((reward) =>
        createAta(kit, reward.mint, { ata: reward.recipient, program: reward.program }),
      );
  });
