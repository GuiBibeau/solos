// @ts-check
/**
 * Close an empty Meteora DLMM position with `close_position2`.
 *
 * Emptiness is decided here, from the share sum, before any instruction is built: a position
 * that still holds liquidity is refused with that sum in the reason. The instruction then
 * names the five IDL accounts plus the two bin arrays the pinned CLI appends for this
 * position's lower bin. Pending fees and rewards are not part of this guard.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { binArrayAddress, eventAuthorityAddress } from "../liquidity/meteora-dlmm-bins.js";
import { decodePositionV2 } from "../liquidity/meteora-dlmm-decode.js";
import {
  closeCoverageIndexes,
  closePosition2Instruction,
} from "../liquidity/meteora-dlmm-position-ix.js";
import { METEORA_DLMM_PROGRAM } from "../liquidity/meteora-dlmm-program.js";
import { liquidityRead } from "./liquidity-token-accounts.js";
import { notMeteora, signMeteoraPosition } from "./meteora-position-sign.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("../liquidity/meteora-dlmm-decode.js").MeteoraPositionLayout} Layout */

/** @param {string} reason */
const rejected = (reason) => new BuildRejected({ reason });

/**
 * @param {{ owner: string; bytes: Uint8Array } | null | undefined} row
 * @returns {{ ok: false; reason: string } | { ok: true; layout: Layout }}
 */
const heldPosition = (row) => {
  if (row === null || row === undefined) {
    return { ok: false, reason: "no account at the position address" };
  }
  if (row.owner !== METEORA_DLMM_PROGRAM) {
    return {
      ok: false,
      reason: "position account is not owned by the pinned Meteora DLMM program",
    };
  }
  const decoded = decodePositionV2(row.bytes);
  if (decoded.status !== "decoded") return { ok: false, reason: decoded.reason };
  return { ok: true, layout: decoded.layout };
};

/** @param {Rpc} ctx @param {string} position */
const readPosition = (ctx, position) =>
  Effect.map(fetchAccounts(liquidityRead(ctx), [position]), ([row]) => heldPosition(row));

/**
 * Owner first, then shares. The share sum is the exact total `decodePositionV2` reports.
 * @param {Layout} layout
 * @param {string} owner
 */
const sharesIssue = (layout, owner) => {
  if (layout.owner !== owner) return "the signer does not own this position";
  if (layout.liquidity > 0n) {
    return (
      `close refused: the position still holds ${layout.liquidity} liquidity shares; ` +
      "remove them all before close"
    );
  }
  return null;
};

/**
 * Writable bin-array PDAs for this position. Indexes come from its stored `lower_bin_id`.
 * @param {string} lbPair
 * @param {number} lowerBinId
 */
const coverageOf = (lbPair, lowerBinId) =>
  Effect.promise(() =>
    Promise.all(closeCoverageIndexes(lowerBinId).map((index) => binArrayAddress(lbPair, index))),
  );

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {import("@solos/actions").ClosePositionAction} action */
export const buildSignedMeteoraClose = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "meteora") return yield* notMeteora("close_position", action.protocol);
    const read = yield* readPosition(ctx, action.position);
    if (!read.ok) return yield* rejected(read.reason);
    const issue = sharesIssue(read.layout, kit.signer.address);
    if (issue !== null) return yield* rejected(issue);
    const eventAuthority = yield* Effect.promise(() => eventAuthorityAddress());
    const binArrays = yield* coverageOf(read.layout.lbPair, read.layout.lowerBinId);
    const instruction = closePosition2Instruction({
      position: action.position,
      sender: kit.signer.address,
      rentReceiver: kit.signer.address,
      eventAuthority,
      binArrays,
    });
    const signed = yield* signMeteoraPosition({ ctx, kit, instructions: [instruction] });
    return { signed, plan: { position: action.position } };
  }).pipe(Effect.withSpan("executor.buildMeteoraClose"));
