// @ts-check
/**
 * What the wallet is allowed to lose to one swap, measured rather than inferred.
 *
 * The route instruction lists the taker writable when a hop needs it — Manifest funds a seat
 * from the trader's wallet, so every Jupiter route through it does. Message compilation
 * coalesces duplicate keys by unioning privileges, and the taker is the fee payer, so a
 * writable occurrence anywhere lets the route CPI a System transfer against the wallet.
 * Refusing the shape (ADR-0023) refused the drain and the Manifest hop alike, and Manifest is
 * most of the SOL -> USDC book.
 *
 * So the bound moves from the shape to the effect: simulate the exact signed transaction, read
 * the taker's lamports on both sides, and refuse to send when the wallet would lose more than
 * the swap's own input plus a fixed overhead allowance. A drain is bounded by the allowance
 * instead of by a proxy for it.
 */
import { address } from "@solana/kit";
import { SimulationFailed } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { WSOL_MINT } from "../swap/jupiter-swap-build-validate.js";
import { simulateSigned, wireForRpc } from "./transfer-sol.js";

/**
 * Everything a swap may cost the wallet beyond its own input: the transaction fee, the priority
 * fee, and rent for every account a route opens.
 *
 * Calibrated against mainnet on 2026-09-24, 50 bps, from a wallet whose SOL and USDC accounts
 * already existed. SOL -> USDC cost 105,000 lamports of overhead on 18 of 20 routes: fees only.
 * SOL -> BONK, whose destination account did not exist, cost 14,638,880 on half its routes —
 * rent for the accounts the route opens. 0.02 SOL clears the worst observed by ~37% and still
 * caps what any admitted build can take to about a cent's worth of SOL beyond the trade.
 *
 * Fixed, not a fraction of notional: overhead is fees and account rent, and neither scales with
 * the amount swapped. A route that needs more is refused, and the rejection names both numbers
 * so the ceiling can be raised deliberately.
 */
export const SWAP_OVERHEAD_LAMPORTS_MAX = 20_000_000n;

const UNREADABLE =
  "simulation did not report the taker's balance, so the spend could not be bounded; nothing was sent";

/** Our own measurements, in base units: what the route would cost against what it may cost. */
/** @param {bigint} spent @param {bigint} allowed */
const overspent = (spent, allowed) =>
  `simulation debited ${spent} lamports, beyond the ${allowed} this swap may cost ` +
  "(its input plus the overhead allowance); nothing was sent";

/**
 * The lamports a swap owes the wallet back: its minimum output, when that output is SOL. Zero
 * for a token output, which the route program bounds on chain instead.
 *
 * A pump trade carries no envelope, so both directions read zero here. That is correct rather
 * than a gap: this credit exists because a Jupiter envelope is provider-supplied instruction
 * data whose real effect only a simulation reveals. A pump sell's floor is `min_sol_output` in
 * an instruction solOS built itself against the pinned program, enforced by that program — a
 * stronger guarantee than the one this credit reconstructs, and one a crafted route cannot
 * reach. The overhead allowance still caps what such a trade may take.
 * @param {{ otherAmountThreshold?: string } | undefined} envelope
 * @param {import("@solos/actions").SwapAction} action
 */
export const minSolCredit = (envelope, action) =>
  action.outputMint === WSOL_MINT ? BigInt(envelope?.otherAmountThreshold ?? "0") : 0n;

/**
 * The most this swap may take from the wallet, net.
 *
 * Netting alone is not enough when the output is SOL. The proceeds land as lamports, so a
 * crafted route can debit the wallet for as much as it is about to credit and the net barely
 * moves — the trade's own output masks the theft, and the wallet ends up short its input
 * tokens with nothing to show. Subtracting the credit the swap owes turns the check two-sided:
 * the balance must end at least `credit - allowance` above where it started.
 *
 * A non-SOL input never debits lamports for the swap itself, so only the overhead is allowed.
 * @param {import("@solos/actions").SwapAction} action
 * @param {bigint} [credit] lamports the swap must return, from `minSolCredit`
 */
export const maxSpendLamports = (action, credit = 0n) =>
  (action.inputMint === WSOL_MINT ? BigInt(action.amount) : 0n) +
  SWAP_OVERHEAD_LAMPORTS_MAX -
  credit;

/**
 * Both sides must be readable numbers. An RPC that answers with a shape we did not expect
 * refuses the swap with this typed reason rather than escaping as an internal error: an
 * unbounded send is exactly what the bound exists to prevent.
 * @param {{ pre: bigint | number | string | null | undefined;
 *   post: bigint | number | null | undefined;
 *   action: import("@solos/actions").SwapAction; credit: bigint }} observed
 */
export const spendRejection = ({ pre, post, action, credit }) => {
  if (pre === undefined || pre === null) return UNREADABLE;
  if (post === undefined || post === null) return UNREADABLE;
  const spent = BigInt(pre) - BigInt(post);
  const allowed = maxSpendLamports(action, credit);
  return spent > allowed ? overspent(spent, allowed) : undefined;
};

/**
 * Simulate the exact signed swap and bound what it costs the wallet. The balance is read strictly
 * before the simulation so "before" is unambiguous; the allowance absorbs a one-slot skew from
 * unrelated activity between the two.
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {{ signed: import("./swap-sol-build.js").Signed; taker: string;
 *   action: import("@solos/actions").SwapAction; credit: bigint }} bound
 */
export const simulateSwapBounded = (ctx, { signed, taker, action, credit }) =>
  Effect.gen(function* () {
    const wire = yield* wireForRpc(signed);
    const pre = yield* rpcCall("getBalance", ctx.url, () =>
      ctx.rpc.getBalance(address(taker)).send(),
    );
    const simulated = yield* rpcCall("simulateTransaction", ctx.url, () =>
      ctx.rpc
        .simulateTransaction(wire, {
          encoding: "base64",
          accounts: { addresses: [address(taker)], encoding: "base64" },
        })
        .send(),
    );
    const raw = {
      err: simulated.value.err,
      logs: [...(simulated.value.logs ?? [])],
      unitsConsumed: (simulated.value.unitsConsumed ?? 0n).toString(),
    };
    if (raw.err !== null) return raw;
    const post = simulated.value.accounts?.[0]?.lamports;
    const rejection = spendRejection({ pre: pre?.value, post, action, credit });
    if (rejection) return yield* new SimulationFailed({ reason: rejection, logs: raw.logs });
    return raw;
  });

/**
 * Dispatch one action's simulation: swaps carry the spend bound, everything else does not.
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape; taker: string; credit?: bigint }} deps
 * @param {import("@solos/actions").Action} action
 * @param {import("./swap-sol-build.js").Signed} signed
 */
export const simulateForAction = ({ ctx, taker, credit = 0n }, action, signed) =>
  action.type === "swap"
    ? simulateSwapBounded(ctx, { signed, taker, action, credit })
    : simulateSigned(ctx, signed);
