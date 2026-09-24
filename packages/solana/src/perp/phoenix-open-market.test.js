// @ts-check
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  decodePerpAssetMap,
  getPhoenixSplineCollectionAddress,
  PHOENIX_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { Effect } from "effect";
import { SolanaRpc, SolanaRpcLive } from "../index.js";
import { ensureOfflineSurfnet } from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import { readOpenMarket } from "./phoenix-open-market.js";
import { SOL_MARKET } from "./phoenix-scenarios.js";

/** @param {string} name */
const publicBytes = (name) =>
  gunzipSync(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

/** @param {Uint8Array} bytes */
const account = (bytes) => ({
  value: {
    owner: PHOENIX_PROGRAM_ADDRESS,
    lamports: 1_000_000,
    data: [Buffer.from(bytes).toString("base64"), "base64"],
    executable: false,
  },
});

test("Phoenix IOC market [integration] pins SOL tick, lot, book and spline to public on-chain accounts", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const mapBytes = publicBytes("perp-asset-map-public.bin.gz");
  const bookBytes = publicBytes("sol-orderbook-public.bin.gz");
  const metadata = decodePerpAssetMap(mapBytes).metadata.entries.find((row) => row.key === "SOL");
  if (!metadata) throw new Error("public SOL map entry missing");
  const book = metadata.value.staticMarketParams.marketAccount;
  const spline = await getPhoenixSplineCollectionAddress(book);
  const market = { ...SOL_MARKET, marketPubkey: book, splinePubkey: spline };
  const fixture = startPhoenixFixture({ market: { SOL: market } });
  const recorder = startRpcRecorder(surfnet.rpcUrl, {
    getAccountInfo: ([key]) => account(key === book ? bookBytes : mapBytes),
  });
  try {
    const read = Effect.flatMap(SolanaRpc, (ctx) =>
      readOpenMarket({
        config: { baseUrl: fixture.url },
        ctx,
        symbol: "SOL",
        mapKey: "2nHGAaEw3D5dd4hVueaUNoygkQFmoeKqRQWnSPqSMFUC",
      }),
    );
    const result = await Effect.runPromise(
      read.pipe(Effect.provide(SolanaRpcLive(recorder.url, surfnet.wsUrl))),
    );
    expect(result).toMatchObject({
      marketAddress: book,
      splineCollection: spline,
      tickSize: 100n,
      baseLotDecimals: 2,
      assetId: 0,
    });
    expect(recorder.callsFor("getAccountInfo")).toHaveLength(2);
  } finally {
    fixture.stop();
    recorder.stop();
  }
});
