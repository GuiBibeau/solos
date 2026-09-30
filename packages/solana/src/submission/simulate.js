// @ts-check
/**
 * Simulate the exact sealed bytes. A venue that needs more than "did it fail" hands over a
 * probe: the accounts whose post-simulation state it needs, a read taken strictly before the
 * simulation, and a verdict on a clean result. The verdict is where a measured bound refuses
 * (the swap spend bound, ADR-0024) or where a venue keeps what it quotes.
 */
import {
  address,
  getBase64Codec,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";

/**
 * @typedef {import("@solos/core").ExecutorError} ExecutorError
 * @typedef {{
 *   readonly err: unknown;
 *   readonly logs: string[];
 *   readonly unitsConsumed: string;
 *   readonly accounts: ReadonlyArray<unknown>;
 * }} Outcome
 * @typedef {{
 *   readonly accounts?: ReadonlyArray<string>;
 *   readonly before?: Effect.Effect<unknown, ExecutorError>;
 *   readonly verdict?: (outcome: Outcome, before: unknown) => Effect.Effect<unknown, ExecutorError>;
 * }} Probe
 * @typedef {Outcome & { readonly verdict: unknown }} Simulated
 * @typedef {{ readonly probe?: Probe; readonly unsigned?: boolean }} SimulateOptions
 */

/**
 * The same bytes with every signature zeroed. An RPC simulates them with signature checks off
 * exactly as it would the signed wire, but nobody can broadcast them: the simulate tier hands a
 * configured endpoint nothing it could relay (ADR-0033).
 * @param {import("@solana/kit").Base64EncodedWireTransaction} wire
 * @returns {import("@solana/kit").Base64EncodedWireTransaction}
 */
export const unsignedWire = (wire) => {
  const transaction = getTransactionDecoder().decode(getBase64Codec().encode(wire));
  const signatures = Object.fromEntries(
    Object.keys(transaction.signatures).map((signer) => [signer, null]),
  );
  return getBase64EncodedWireTransaction({ ...transaction, signatures });
};

/**
 * Signature checks are always off: the bytes were signed by this process (or deliberately
 * unsigned), and a simulation proves the program effect, not the signer.
 * @param {ReadonlyArray<string> | undefined} accounts
 */
const optionsFor = (accounts) =>
  accounts === undefined || accounts.length === 0
    ? { encoding: /** @type {const} */ ("base64"), sigVerify: false }
    : {
        encoding: /** @type {const} */ ("base64"),
        sigVerify: false,
        accounts: { addresses: accounts.map((a) => address(a)), encoding: "base64" },
      };

/**
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {import("./sealed.js").Sealed} sealed
 * @param {SimulateOptions} options
 * @returns {Effect.Effect<Outcome, import("@solos/core").RpcError>}
 */
const simulateWire = (ctx, sealed, { probe, unsigned }) =>
  Effect.map(
    rpcCall("simulateTransaction", ctx.url, () =>
      ctx.rpc
        .simulateTransaction(
          unsigned === true ? unsignedWire(sealed.wire) : sealed.wire,
          /** @type {Parameters<typeof ctx.rpc.simulateTransaction>[1]} */ (
            optionsFor(probe?.accounts)
          ),
        )
        .send(),
    ),
    ({ value }) => {
      const view =
        /** @type {{ err: unknown; logs?: readonly string[] | null; unitsConsumed?: bigint | null; accounts?: ReadonlyArray<unknown> | null }} */ (
          value
        );
      return {
        err: view.err,
        logs: [...(view.logs ?? [])],
        unitsConsumed: (view.unitsConsumed ?? 0n).toString(),
        accounts: view.accounts ?? [],
      };
    },
  );

/**
 * Run the probe's read, simulate, then judge a clean result. A failed simulation is returned,
 * not raised: the simulate tier reports it and the execute order refuses on it. `unsigned`
 * simulates the zeroed-signature bytes; the simulate tier always does, since nothing it
 * simulates may be relayable.
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {import("./sealed.js").Sealed} sealed
 * @param {SimulateOptions} [options]
 * @returns {Effect.Effect<Simulated, ExecutorError>}
 */
export const simulateSealed = (ctx, sealed, options = {}) =>
  Effect.gen(function* () {
    const probe = options.probe ?? {};
    const before = probe.before === undefined ? undefined : yield* probe.before;
    const outcome = yield* simulateWire(ctx, sealed, options);
    if (outcome.err !== null || probe.verdict === undefined) return { ...outcome, verdict: null };
    return { ...outcome, verdict: yield* probe.verdict(outcome, before) };
  });
