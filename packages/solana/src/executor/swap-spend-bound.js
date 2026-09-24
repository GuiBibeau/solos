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
 * The most this swap may take from the wallet. A non-SOL input never debits lamports for the
 * swap itself, so only the overhead is allowed.
 * @param {import("@solos/actions").SwapAction} action
 */
export const maxSpendLamports = (action) =>
  (action.inputMint === WSOL_MINT ? BigInt(action.amount) : 0n) + SWAP_OVERHEAD_LAMPORTS_MAX;

/**
 * @param {bigint | number | string} pre
 * @param {bigint | number | null | undefined} post
 * @param {import("@solos/actions").SwapAction} action
 */
const spendRejection = (pre, post, action) => {
  if (post === undefined || post === null) return UNREADABLE;
  const spent = BigInt(pre) - BigInt(post);
  const allowed = maxSpendLamports(action);
  return spent > allowed ? overspent(spent, allowed) : undefined;
};

/**
 * Simulate the exact signed swap and bound what it costs the wallet. The balance read and the
 * simulation run together: both observe the same recent bank, and the allowance dwarfs a
 * one-slot skew from unrelated activity.
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {{ signed: import("./swap-sol-build.js").Signed; taker: string; action: import("@solos/actions").SwapAction }} bound
 */
export const simulateSwapBounded = (ctx, { signed, taker, action }) =>
  Effect.gen(function* () {
    const wire = yield* wireForRpc(signed);
    const [pre, simulated] = yield* Effect.all(
      [
        rpcCall("getBalance", ctx.url, () => ctx.rpc.getBalance(address(taker)).send()),
        rpcCall("simulateTransaction", ctx.url, () =>
          ctx.rpc
            .simulateTransaction(wire, {
              encoding: "base64",
              accounts: { addresses: [address(taker)], encoding: "base64" },
            })
            .send(),
        ),
      ],
      { concurrency: 2 },
    );
    const raw = {
      err: simulated.value.err,
      logs: [...(simulated.value.logs ?? [])],
      unitsConsumed: (simulated.value.unitsConsumed ?? 0n).toString(),
    };
    if (raw.err !== null) return raw;
    const rejection = spendRejection(pre.value, simulated.value.accounts?.[0]?.lamports, action);
    if (rejection) return yield* new SimulationFailed({ reason: rejection, logs: raw.logs });
    return raw;
  });

/**
 * Dispatch one action's simulation: swaps carry the spend bound, everything else does not.
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape; taker: string }} deps
 * @param {import("@solos/actions").Action} action
 * @param {import("./swap-sol-build.js").Signed} signed
 */
export const simulateForAction = ({ ctx, taker }, action, signed) =>
  action.type === "swap"
    ? simulateSwapBounded(ctx, { signed, taker, action })
    : simulateSigned(ctx, signed);
