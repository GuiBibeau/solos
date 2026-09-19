// @ts-check
/** @typedef {import("@solos/core/launch").LaunchCurveError} LaunchCurveError */
/** @typedef {import("@solos/core/launch").LaunchCurve} LaunchCurve */
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./bonding-curve.js").BondingCurveLayout} BondingCurveLayout */
import { getBase58Decoder } from "@solana/kit";
import {
  CurveConfigUnavailable,
  CurveCorrupt,
  CurveUnavailable,
  LaunchVenue,
  UnsupportedQuoteAsset,
  progressBps,
} from "@solos/core/launch";
import { Effect, Layer } from "effect";
import { fetchAccount, TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { base64AccountData } from "../market/mint-account.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { bondingCurveAddress, decodeBondingCurve, isSolQuote } from "./bonding-curve.js";
import { decodeGlobalConfig, globalConfigAddress } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";

const base58 = getBase58Decoder();

/**
 * Pure derivation of the curve PDA. Derivation cannot realistically fail for a decoded
 * 32-byte mint; the mapped failure keeps the error channel total.
 * @param {string} mint
 * @returns {Effect.Effect<string, CurveCorrupt>}
 */
const deriveCurveAddress = (mint) =>
  Effect.tryPromise({
    try: () => bondingCurveAddress(mint),
    catch: () =>
      new CurveCorrupt({ mint, curveAddress: "", reason: "curve address could not be derived" }),
  });

/**
 * Guard one fetched curve account: the pinned pump program owns it, the layout decodes, and
 * the quote asset is SOL. The curve stores no mint of its own, so identity is exactly
 * derived address + owner + discriminator — an impostor account fails here as corrupt.
 * @param {string} mint
 * @param {string} curveAddress
 * @param {{ readonly owner: string; readonly data: readonly [string, string] }} info
 * @returns {Effect.Effect<BondingCurveLayout, CurveCorrupt | UnsupportedQuoteAsset>}
 */
const readCurveAccount = (mint, curveAddress, info) => {
  if (info.owner !== PUMP_PROGRAM) {
    return Effect.fail(
      new CurveCorrupt({
        mint,
        curveAddress,
        reason: "curve account is not owned by the pinned pump program",
      }),
    );
  }
  const decoded = decodeBondingCurve(base64AccountData(info.data));
  if (decoded.status === "corrupt") {
    return Effect.fail(new CurveCorrupt({ mint, curveAddress, reason: decoded.reason }));
  }
  const quoteMint = decoded.layout.quoteMint;
  if (quoteMint !== undefined && !isSolQuote(quoteMint)) {
    return Effect.fail(new UnsupportedQuoteAsset({ mint, quoteMint: base58.decode(quoteMint) }));
  }
  return Effect.succeed(decoded.layout);
};

/**
 * The curve half of the read: absent fails `CurveUnavailable` before anything else is read.
 * @param {AccountRead} read
 * @param {string} mint
 * @returns {Effect.Effect<BondingCurveLayout, LaunchCurveError>}
 */
const curveLayout = (read, mint) =>
  Effect.gen(function* () {
    const curveAddress = yield* deriveCurveAddress(mint);
    const info = yield* fetchAccount(read, curveAddress);
    if (info === null) return yield* new CurveUnavailable({ mint, curveAddress });
    return yield* readCurveAccount(mint, curveAddress, info);
  });

/**
 * The Global half of the read: the protocol's live initial-real-reserve configuration, which
 * `set_params` can change, so it is never assumed from a documented constant. Any Global
 * failure is `CurveConfigUnavailable` — a distinct tag from a nonexistent curve, and never a
 * silent fallback to a guessed constant.
 * @param {AccountRead} read
 * @returns {Effect.Effect<bigint, CurveConfigUnavailable | import("@solos/core").RpcError>}
 */
const globalInitialRealTokenReserves = (read) =>
  Effect.gen(function* () {
    const configAddress = yield* Effect.promise(globalConfigAddress);
    const info = yield* fetchAccount(read, configAddress);
    if (info !== null && info.owner !== PUMP_PROGRAM) {
      return yield* new CurveConfigUnavailable({
        reason: "Global config account is not owned by the pinned pump program",
      });
    }
    const decoded = decodeGlobalConfig(info === null ? null : base64AccountData(info.data));
    if (decoded.status === "corrupt") {
      return yield* new CurveConfigUnavailable({ reason: decoded.reason });
    }
    return decoded.initialRealTokenReserves;
  });

/**
 * The whole read in protocol order: curve first (an absent curve short-circuits as
 * `CurveUnavailable` regardless of Global state), then the quote gate, then Global, then
 * progress from real token reserves. At most two bounded account reads happen; there is no
 * retry, no off-chain fetch, no signing, no Jupiter fallback.
 * @param {AccountRead} read
 * @param {string} mint
 * @returns {Effect.Effect<LaunchCurve, LaunchCurveError>}
 */
const getCurveLive = (read, mint) =>
  Effect.gen(function* () {
    const layout = yield* curveLayout(read, mint);
    const initialRealTokenReserves = yield* globalInitialRealTokenReserves(read);
    return {
      mint,
      program: PUMP_PROGRAM,
      complete: layout.complete,
      progressBps: progressBps(initialRealTokenReserves, layout.realTokenReserves),
      virtualSolReserves: layout.virtualQuoteReserves.toString(),
      virtualTokenReserves: layout.virtualTokenReserves.toString(),
    };
  });

/**
 * Live `LaunchVenue` over the shared `SolanaRpc` service: one configured endpoint, the same
 * one every other Solana tool uses. No config parameter, no env access, no fallback endpoint.
 * @param {{ readonly timeoutMs?: number }} [config] injectable read deadline, for tests
 */
export const LaunchVenueLive = (config) =>
  Layer.effect(
    LaunchVenue,
    Effect.map(SolanaRpc, (ctx) => {
      /** @type {AccountRead} */
      const read = {
        rpc: ctx.rpc,
        origin: rpcOrigin(ctx.url),
        timeoutMs: config?.timeoutMs ?? TOKEN_RPC_TIMEOUT_MS,
      };
      return { getCurve: (mint) => getCurveLive(read, mint) };
    }),
  );
