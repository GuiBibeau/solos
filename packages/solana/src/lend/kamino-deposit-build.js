// @ts-check
/**
 * The executor's lend-deposit half: turn one `lend` action into exactly one draft for
 * Submission to seal (ADR-0032), or a typed failure before anything is signed. The market is
 * revalidated against the executor's configuration (ADR-0019), the pure plan runs against real
 * RPC through a thin reader, and the plan's instructions become the draft under the local v1
 * budget. A rejected plan is a `BuildRejected`: the intent never becomes bytes.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { base64AccountData } from "../market/mint-account.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { depositFacts, kaminoDepositSdk } from "./kamino-deposit-facts.js";
import { depositPlan } from "./kamino-deposit-plan.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("@solos/actions").LendAction} LendAction */
/** @typedef {import("./kamino-deposit-plan.js").DepositPlanOk} DepositPlanOk */

/** Local v1 policy for the deposit: bounded compute, the chain-max data limit, small tip. */
export const KAMINO_DEPOSIT_V1_CONFIG = Object.freeze({
  computeUnitLimit: 300_000,
  loadedAccountsDataSizeLimit: 67_108_864,
  priorityFeeLamports: 1000n,
});

const READ_TIMEOUT_MS = 15_000;

/**
 * The plain obligation state the plan's guards check, decoded here at the seam so the plan
 * stays SDK-free. Only active borrows (nonzero debt) survive the mapping; a body that does
 * not decode as a klend obligation yields `undefined` state, which the guard rejects.
 * @param {any} sdk @param {import("./kamino-deposit-plan.js").FetchedRow} row
 * @returns {import("./kamino-deposit-plan.js").ObligationState}
 */
const decodedObligationState = (sdk, row) => {
  try {
    const state = sdk.Obligation.decode(Buffer.from(row.bytes));
    return {
      owner: state.owner.toString(),
      lendingMarket: state.lendingMarket.toString(),
      tag: Number(state.tag),
      deposits: state.deposits.map((/** @type {any} */ d) => ({
        depositReserve: d.depositReserve.toString(),
        depositedAmount: d.depositedAmount,
      })),
      borrows: state.borrows
        .filter((/** @type {any} */ b) => BigInt(b.borrowedAmountSf?.toString?.() ?? 0n) > 0n)
        .map((/** @type {any} */ b) => b.borrowReserve.toString()),
    };
  } catch {
    return undefined;
  }
};

/**
 * The plan's reader over real RPC: batched account rows and rent-exempt minimums. Transport
 * failures keep the shared `RpcError` channel; every account-level rejection stays a plan
 * value.
 * @param {Rpc} ctx
 * @returns {import("./kamino-deposit-plan.js").DepositReader}
 */
export const chainReader = (ctx) => {
  const read = { rpc: ctx.rpc, origin: rpcOrigin(ctx.url), timeoutMs: READ_TIMEOUT_MS };
  return {
    rows: (accounts) => fetchRows(read, accounts),
    rent: (sizes) =>
      Effect.all(
        sizes.map((size) =>
          rpcCall("getMinimumBalanceForRentExemption", read.origin, () =>
            /** @type {any} */ (read.rpc).getMinimumBalanceForRentExemption(size).send(),
          ),
        ),
      ),
  };
};

/**
 * @param {{ rpc: Rpc["rpc"]; origin: string; timeoutMs: number }} read
 * @param {readonly string[]} accounts
 * @returns {import("effect").Effect.Effect<ReadonlyArray<import("./kamino-deposit-plan.js").FetchedRow | null>, import("@solos/core").RpcError>}
 */
const fetchRows = (read, accounts) =>
  Effect.gen(function* () {
    const sdk = yield* Effect.promise(() => kaminoDepositSdk());
    const result = yield* rpcCall("getMultipleAccounts", read.origin, () =>
      read.rpc
        .getMultipleAccounts(
          accounts.map((a) => /** @type {any} */ (a)),
          {
            encoding: "base64",
          },
        )
        .send({ abortSignal: AbortSignal.timeout(read.timeoutMs) }),
    );
    return result.value.map((/** @type {any} */ account) => {
      if (account === null) return null;
      const row = {
        owner: account.owner,
        bytes: base64AccountData(account.data),
      };
      // klend-owned rows (the obligation, the user metadata) carry their decoded state;
      // accounts of other programs come as raw rows.
      return row.owner === KLEND_PROGRAM_ID
        ? { ...row, state: decodedObligationState(sdk, row) }
        : row;
    });
  });

/**
 * Draft one Kamino deposit. The action's market must be this executor's configured market;
 * reserve/obligation/balance correspondence is the pure plan's job.
 * @param {{ ctx: Rpc; kit: Kit; market: string }} deps
 * @param {LendAction} action
 * @returns {import("effect").Effect.Effect<
 *   { readonly draft: import("../submission/seal-draft.js").Draft; readonly plan: DepositPlanOk },
 *   import("@solos/core").BuildRejected | import("@solos/core").RpcError
 * >}
 */
export const draftLendDeposit = ({ ctx, kit, market }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "kamino") {
      return yield* new BuildRejected({
        reason: "the deposit path is pinned to the kamino protocol",
      });
    }
    if (action.market !== market) {
      return yield* new BuildRejected({
        reason: `the action names market ${action.market}, but this executor is configured for ${market}`,
      });
    }
    const facts = yield* depositFacts(
      { rpc: ctx.rpc, url: ctx.url },
      { market: action.market, mint: action.mint, amount: BigInt(action.amount) },
    );
    const plan = yield* depositPlan({
      reader: chainReader(ctx),
      intent: {
        market: action.market,
        mint: action.mint,
        amount: BigInt(action.amount),
        owner: kit.signer.address,
      },
      facts,
      signer: kit.signer,
    });
    if (plan.status === "reject") {
      return yield* new BuildRejected({ reason: plan.reason });
    }
    return { draft: lendDraft("Kamino deposit", plan.instructions), plan };
  }).pipe(Effect.withSpan("executor.buildLendDeposit"));

/**
 * Either lending plan as a draft: the plan's instructions, in the order the program introspects
 * (refreshes contiguous before the deposit), under the local v1 budget. Submission seals it and
 * never reorders it (ADR-0032).
 * @param {string} label
 * @param {readonly { programAddress: string }[]} instructions
 * @returns {import("../submission/seal-draft.js").Draft}
 */
export const lendDraft = (label, instructions) => ({
  label,
  instructions: /** @type {any} */ (instructions),
  config: KAMINO_DEPOSIT_V1_CONFIG,
});

/**
 * The plan's quote as the published venueQuote value: exact encoded amount, the pinned-math
 * collateral estimate at the read-time rate, and the rent/fee evidence (ADR-0019).
 * @param {DepositPlanOk["quote"]} quote
 * @returns {import("@solos/actions").LendDepositQuote}
 */
export const lendQuoteOf = (quote) => quote;
