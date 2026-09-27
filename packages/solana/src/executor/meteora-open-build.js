// @ts-check
/**
 * Open an empty Meteora DLMM position at a bin window the caller supplies.
 *
 * The position account is a fresh keypair, used once as the instruction's second signer, and
 * dropped. Only its pubkey leaves this module, on the plan, so a landed transaction can still
 * be found. Width is checked again here so a hand-built Action cannot clamp what the use case
 * already refuses.
 */
import { generateKeyPairSigner } from "@solana/kit";
import { meteoraWidthIssue } from "@solos/actions";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { eventAuthorityAddress } from "../liquidity/meteora-dlmm-bins.js";
import { decodeLbPair } from "../liquidity/meteora-dlmm-decode.js";
import { initializePositionInstruction } from "../liquidity/meteora-dlmm-position-ix.js";
import { METEORA_DLMM_PROGRAM } from "../liquidity/meteora-dlmm-program.js";
import { liquidityRead } from "./liquidity-token-accounts.js";
import { meteoraPositionDraft, notMeteora } from "./meteora-position-draft.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {Awaited<ReturnType<typeof generateKeyPairSigner>>} PositionSigner */

/** @param {string} reason */
const rejected = (reason) => new BuildRejected({ reason });

/**
 * @param {Rpc} ctx
 * @param {string} pool
 */
const readPair = (ctx, pool) =>
  Effect.gen(function* () {
    const [row] = yield* fetchAccounts(liquidityRead(ctx), [pool]);
    if (row === null || row === undefined) {
      return { ok: /** @type {const} */ (false), reason: "the pair was not found on chain" };
    }
    if (row.owner !== METEORA_DLMM_PROGRAM) {
      return {
        ok: /** @type {const} */ (false),
        reason: "the pair is not owned by the pinned Meteora DLMM program",
      };
    }
    const decoded = decodeLbPair(row.bytes);
    if (decoded.status !== "decoded")
      return { ok: /** @type {const} */ (false), reason: decoded.reason };
    return { ok: /** @type {const} */ (true) };
  });

/**
 * Attach the ephemeral signer to the position meta (index 1) and nowhere else.
 * @param {PositionSigner} positionSigner
 * @param {ReturnType<typeof initializePositionInstruction>["accounts"]} accounts
 */
const admitPositionSigner = (positionSigner, accounts) =>
  accounts.map((meta, index) => (index === 1 ? { ...meta, signer: positionSigner } : meta));

/**
 * @param {{ payer: string; lbPair: string; lowerBinId: number; width: number;
 *   positionSigner: PositionSigner; eventAuthority: string }} parts
 */
const openInstruction = (parts) => {
  const built = initializePositionInstruction(
    {
      payer: parts.payer,
      position: parts.positionSigner.address,
      lbPair: parts.lbPair,
      owner: parts.payer,
      eventAuthority: parts.eventAuthority,
    },
    { lowerBinId: parts.lowerBinId, width: parts.width },
  );
  return { ...built, accounts: admitPositionSigner(parts.positionSigner, built.accounts) };
};

/**
 * @param {any} action
 * @param {{ position: string }} plan
 */
export const meteoraOpenQuoteOf = (action, plan) => ({
  kind: /** @type {const} */ ("meteora_position_open"),
  pool: action.pool,
  lowerBinId: action.lowerBinId,
  width: action.width,
  position: plan.position,
});

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {any} action */
export const draftMeteoraOpen = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "meteora") return yield* notMeteora("open_position", action.protocol);
    const issue = meteoraWidthIssue(action.lowerBinId, action.width);
    if (issue !== null) return yield* rejected(issue);
    const read = yield* readPair(ctx, action.pool);
    if (!read.ok) return yield* rejected(read.reason);
    const positionSigner = yield* Effect.promise(() => generateKeyPairSigner());
    const eventAuthority = yield* Effect.promise(() => eventAuthorityAddress());
    const instruction = openInstruction({
      payer: kit.signer.address,
      lbPair: action.pool,
      lowerBinId: action.lowerBinId,
      width: action.width,
      positionSigner,
      eventAuthority,
    });
    const draft = meteoraPositionDraft("Meteora open", [instruction]);
    return { draft, plan: { position: positionSigner.address } };
  }).pipe(Effect.withSpan("executor.buildMeteoraOpen"));
