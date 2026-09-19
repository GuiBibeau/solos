// @ts-check
import { createSolanaRpc, createSolanaRpcSubscriptions, getAddressDecoder } from "@solana/kit";
import { getCurve } from "@solos/core/launch";
import { Cause, Effect, Layer, Option } from "effect";
import { LaunchVenueLive } from "../index.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { freshCurveBytes, globalConfigBytes } from "./test-fixtures.js";

/**
 * Loopback JSON-RPC fixtures for the launch-curve adapter tests: raw `getAccountInfo`
 * servers on 127.0.0.1 with per-scenario account maps, plus one use-case read against a
 * chosen endpoint. No Surfnet, no public endpoint — failures come from the server shape.
 */

/** A fresh, never-funded address. */
export const randomMint = () =>
  getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

/** The good SOL-paired curve body the fixture servers serve. */
export const CURVE_BYTES = freshCurveBytes();
export const GLOBAL_BYTES = globalConfigBytes();
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export { SYSTEM_PROGRAM };

/**
 * A JSON-RPC endpoint answering `getAccountInfo` from an address map.
 * @param {Map<string, { owner: string; data: Uint8Array } | null>} accounts
 */
export const startRpcServer = (accounts) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = /** @type {{ id: number; params: [string, unknown] }} */ (await request.json());
      const account = accounts.get(rpc.params[0]) ?? null;
      const value =
        account === null
          ? null
          : {
              data: [Buffer.from(account.data).toString("base64"), "base64"],
              executable: false,
              lamports: 1_461_600,
              owner: account.owner,
              space: account.data.length,
            };
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { context: { slot: 1 }, value },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/**
 * The standard fixture: the good curve at its PDA, the given Global behavior at its PDA,
 * everything else absent.
 * @param {string} mint
 * @param {{ owner: string; data: Uint8Array } | null} globalAccount
 */
export const startCurveServer = async (mint, globalAccount) => {
  const accounts = new Map([
    [await bondingCurveAddress(mint), { owner: PUMP_PROGRAM, data: CURVE_BYTES }],
    [await globalConfigAddress(), globalAccount],
  ]);
  return startRpcServer(accounts);
};

/**
 * One read through the core use case and the live adapter against `url`.
 * @param {string} url
 * @param {string} mint
 * @param {number} [timeoutMs]
 */
export const readAt = async (
  /** @type {string} */ url,
  /** @type {string} */ mint,
  /** @type {number} */ timeoutMs = 5000,
) => {
  const layer = LaunchVenueLive({ timeoutMs }).pipe(
    Layer.provide(
      Layer.succeed(SolanaRpc, {
        url,
        rpc: createSolanaRpc(url),
        rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:9"),
      }),
    ),
  );
  const exit = await Effect.runPromiseExit(getCurve({ mint }).pipe(Effect.provide(layer)));
  if (exit._tag === "Failure") {
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(`expected a domain error: ${String(exit.cause)}`);
    return /** @type {object} */ (failure.value);
  }
  return exit.value;
};

/** The expected LaunchCurve body for the good fixture curve. @param {string} mint */
export const expectedFixtureCurve = (mint) => ({
  mint,
  program: PUMP_PROGRAM,
  complete: false,
  progressBps: 0,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
});
