// @ts-check
import {
  decodeOrderbookHeader,
  decodePerpAssetMap,
  getPhoenixSplineCollectionAddress,
  PHOENIX_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { address } from "@solana/kit";
import { BuildRejected, BuildUnavailable } from "@solos/core";
import { Effect } from "effect";
import { z } from "zod";
import { base64AccountData } from "../market/mint-account.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { MARKET_PATH } from "./phoenix-api.js";
import { phoenixOnboardGet } from "./phoenix-onboard-api.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
const Market = z.object({
  symbol: z.string(),
  assetId: z.number().int().nonnegative(),
  marketStatus: z.string(),
  marketPubkey: z.string(),
  splinePubkey: z.string(),
  tickSize: z.number().int().positive(),
  baseLotsDecimals: z.number().int(),
});

/** @param {Rpc} ctx @param {string} key @param {number} maxBytes */
const readProgramAccount = (ctx, key, maxBytes) =>
  Effect.gen(function* () {
    const { value } = yield* rpcCall("getAccountInfo", ctx.url, () =>
      ctx.rpc.getAccountInfo(address(key), { encoding: "base64", commitment: "confirmed" }).send(),
    );
    if (!value || value.owner !== PHOENIX_PROGRAM_ADDRESS)
      return yield* new BuildRejected({ reason: "Phoenix market account is missing or misowned" });
    const bytes = yield* Effect.try({
      try: () => base64AccountData(value.data),
      catch: () => new BuildRejected({ reason: "Phoenix market account data is invalid" }),
    });
    if (bytes.length > maxBytes)
      return yield* new BuildRejected({
        reason: "Phoenix market account exceeds its bounded size",
      });
    return bytes;
  });

/** @param {import("./phoenix-api.js").PhoenixConfig} config @param {string} symbol */
const apiMarket = (config, symbol) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.tryPromise({
      try: () => phoenixOnboardGet(config, `${MARKET_PATH}/${encodeURIComponent(symbol)}`),
      catch: () => new BuildUnavailable({ reason: "Phoenix market metadata unavailable" }),
    });
    if (outcome.status !== 200)
      return yield* new BuildRejected({ reason: `Phoenix market ${symbol} is unavailable` });
    const parsed = Market.safeParse(outcome.body);
    if (!parsed.success)
      return yield* new BuildRejected({ reason: "Phoenix market metadata is incomplete" });
    return parsed.data;
  });

/** @param {{api:z.infer<typeof Market>;header:import("@ellipsis-labs/rise").OrderbookHeader;symbol:string}} facts */
const isStatusMatching = ({ api, header, symbol }) =>
  api.symbol === symbol &&
  api.marketStatus === "active" &&
  header.marketStatus === 1 &&
  header.assetSymbol === symbol;

/** @param {{api:z.infer<typeof Market>;header:import("@ellipsis-labs/rise").OrderbookHeader;params:import("@ellipsis-labs/rise").StaticMarketParams;spline:string}} facts */
const areParamsMatching = ({ api, header, params, spline }) =>
  api.assetId === params.assetId &&
  header.assetId === params.assetId &&
  api.marketPubkey === params.marketAccount &&
  api.splinePubkey === spline &&
  api.tickSize === Number(params.tickSize) &&
  header.tickSizeInQuoteLotsPerBaseLot === params.tickSize &&
  api.baseLotsDecimals === params.baseLotDecimals &&
  header.baseLotsDecimals === params.baseLotDecimals;

/** @param {{api:z.infer<typeof Market>;metadata:import("@ellipsis-labs/rise").PerpAssetMetadata;header:import("@ellipsis-labs/rise").OrderbookHeader;symbol:string;spline:string}} facts */
const checkMarket = ({ api, metadata, header, symbol, spline }) => {
  const params = metadata.staticMarketParams;
  if (
    !isStatusMatching({ api, header, symbol }) ||
    !areParamsMatching({ api, header, params, spline })
  )
    throw new BuildRejected({
      reason: "Phoenix market identity, status or lot/tick size disagrees with on-chain state",
    });
  return {
    marketAddress: params.marketAccount,
    splineCollection: spline,
    tickSize: params.tickSize,
    baseLotDecimals: params.baseLotDecimals,
    assetId: params.assetId,
    leverageTiers: metadata.riskParams.leverageTiers,
  };
};

/** Resolve one market against on-chain Phoenix asset map and book; an API address cannot redirect
 * the signer. The large fixed-size asset map is capped at two MiB.
 * @param {{config:import("./phoenix-api.js").PhoenixConfig;ctx:Rpc;symbol:string;mapKey:string}} facts */
export const readOpenMarket = ({ config, ctx, symbol, mapKey }) =>
  Effect.gen(function* () {
    const api = yield* apiMarket(config, symbol);
    const mapBytes = yield* readProgramAccount(ctx, mapKey, 2_097_152);
    const map = yield* Effect.try({
      try: () => decodePerpAssetMap(mapBytes),
      catch: () => new BuildRejected({ reason: "Phoenix asset map could not be decoded" }),
    });
    const metadata = map.metadata.entries.find((entry) => entry.key === symbol)?.value;
    if (!metadata)
      return yield* new BuildRejected({
        reason: "Phoenix market is absent from the on-chain asset map",
      });
    const bookBytes = yield* readProgramAccount(
      ctx,
      metadata.staticMarketParams.marketAccount,
      2_097_152,
    );
    const header = yield* Effect.try({
      try: () => decodeOrderbookHeader(bookBytes),
      catch: () => new BuildRejected({ reason: "Phoenix orderbook header could not be decoded" }),
    });
    const spline = yield* Effect.tryPromise({
      try: () => getPhoenixSplineCollectionAddress(metadata.staticMarketParams.marketAccount),
      catch: () => new BuildRejected({ reason: "Phoenix spline address could not be derived" }),
    });
    return yield* Effect.try({
      try: () => checkMarket({ api, metadata, header, symbol, spline }),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix market could not be verified" }),
    });
  });
