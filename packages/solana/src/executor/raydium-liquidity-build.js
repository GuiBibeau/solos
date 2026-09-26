// @ts-check
/**
 * Assemble and sign one Raydium CLMM add or remove under the local v1 policy. Nothing here can
 * send. A refused plan never becomes bytes.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
import {
  decreaseLiquidityV2Accounts,
  decreaseLiquidityV2Data,
  increaseLiquidityV2Accounts,
  increaseLiquidityV2Data,
  raydiumInstruction,
} from "../liquidity/raydium-clmm-instruction.js";
import { raydiumDepositPlan, raydiumWithdrawPlan } from "../liquidity/raydium-clmm-plan.js";
import {
  fundingSide,
  liquidityRead,
  receivingSide,
  setupSides,
} from "./liquidity-token-accounts.js";
import { signRaydiumPosition } from "./raydium-position-sign.js";
import { rewardSetup } from "./raydium-reward-setup.js";
import { WSOL_MINT, wrapForSides } from "./wrap-sol.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/** The plan's reader seam bound to real RPC. @param {Rpc} ctx @param {string} owner */
const readerFor = (ctx, owner) => {
  const read = liquidityRead(ctx);
  return {
    rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(read, accounts),
    custody: (/** @type {string} */ mint) => positionNftAccount(read, owner, mint),
  };
};

/** The two funding sides of a Raydium plan, in instruction order. @param {any} plan */
const raydiumSides = (plan) => [
  { mint: plan.mintA, ata: plan.accounts.tokenAccount0, required: plan.requiredA },
  { mint: plan.mintB, ata: plan.accounts.tokenAccount1, required: plan.requiredB },
];

/**
 * Prove the two owner token accounts. A deposit needs them funded for whatever the quote
 * requires; a removal only needs them to exist, and creates a missing one when it is owed
 * nothing. Both rules are the shared ones, so Orca and Raydium refuse identically.
 * @param {{ ctx: Rpc; kit: Kit; plan: any; verb: "deposit" | "removal"; covered?: bigint }} parts
 */
const tokenSetup = ({ ctx, kit, plan, verb, covered }) =>
  setupSides(
    liquidityRead(ctx),
    {
      tokenOwnerAccountA: plan.accounts.tokenAccount0,
      tokenOwnerAccountB: plan.accounts.tokenAccount1,
    },
    ({ row, label }) => {
      const side = {
        kit,
        row,
        label,
        mint: label === "A" ? plan.mintA : plan.mintB,
        ata: label === "A" ? plan.accounts.tokenAccount0 : plan.accounts.tokenAccount1,
        program: label === "A" ? plan.programs.token0 : plan.programs.token1,
      };
      return verb === "deposit"
        ? fundingSide({
            ...side,
            verb,
            required: label === "A" ? plan.requiredA : plan.requiredB,
            covered: side.mint === WSOL_MINT ? covered : 0n,
          })
        : receivingSide({ ...side, owed: label === "A" ? plan.minA : plan.minB });
    },
  );

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {any} action
 * @returns {Effect.Effect<{ signed: any; plan: any }, import("@solos/core").ExecutorError>}
 */
export const buildSignedRaydiumDeposit = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const owner = kit.signer.address;
    const plan = yield* raydiumDepositPlan({
      reader: readerFor(ctx, owner),
      owner,
      action: {
        pool: action.pool,
        position: action.position,
        amountA: BigInt(action.amountA),
        amountB: BigInt(action.amountB),
        maxSlippageBps: action.maxSlippageBps,
      },
    });
    if (plan.status === "reject") return yield* new BuildRejected({ reason: plan.reason });
    const wrap = yield* wrapForSides({
      ctx,
      kit,
      wrapSol: action.wrapSol === true,
      sides: raydiumSides(plan),
    });
    const creates = yield* tokenSetup({ ctx, kit, plan, verb: "deposit", covered: wrap.covered });
    const instruction = raydiumInstruction(
      increaseLiquidityV2Accounts(plan.accounts),
      increaseLiquidityV2Data({
        liquidity: plan.liquidity,
        amount0Max: plan.tokenMaxA,
        amount1Max: plan.tokenMaxB,
      }),
    );
    const signed = yield* signRaydiumPosition({
      ctx,
      kit,
      instructions: [...wrap.prefix, ...creates, instruction, ...wrap.suffix],
    });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildRaydiumDeposit"));

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {any} action
 * @returns {Effect.Effect<{ signed: any; plan: any }, import("@solos/core").ExecutorError>}
 */
export const buildSignedRaydiumWithdraw = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const owner = kit.signer.address;
    const plan = yield* raydiumWithdrawPlan({
      reader: readerFor(ctx, owner),
      owner,
      action: {
        position: action.position,
        bps: action.bps,
        maxSlippageBps: action.maxSlippageBps,
      },
    });
    if (plan.status === "reject") return yield* new BuildRejected({ reason: plan.reason });
    const creates = yield* tokenSetup({ ctx, kit, plan, verb: "removal" });
    const rewardCreates = yield* rewardSetup({ ctx, kit, rewards: plan.rewards });
    const instruction = raydiumInstruction(
      decreaseLiquidityV2Accounts(plan.accounts, plan.rewards),
      decreaseLiquidityV2Data({
        liquidity: plan.liquidity,
        amount0Min: plan.minA,
        amount1Min: plan.minB,
      }),
    );
    const signed = yield* signRaydiumPosition({
      ctx,
      kit,
      instructions: [...creates, ...rewardCreates, instruction],
    });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildRaydiumWithdraw"));
