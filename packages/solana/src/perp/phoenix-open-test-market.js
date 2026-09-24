// @ts-check
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  decodeGlobalConfiguration,
  decodePerpAssetMap,
  getPhoenixSplineCollectionAddress,
  PHOENIX_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { getBase16Decoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/index.js";
import globalRaw from "./fixtures/global-public.json";
import { SOL_MARKET } from "./phoenix-scenarios.js";

/** @param {string} path */
const unpack = (path) => gunzipSync(readFileSync(new URL(path, import.meta.url)));

/** Seed only PUBLIC mainnet program-owned market account bytes into the isolated Surfpool fork.
 * No wallet information or mainnet sends are involved.
 * @param {string} rpcUrl */
export const seedOpenMarket = async (rpcUrl) => {
  const mapKey = decodeGlobalConfiguration(
    Buffer.from(globalRaw.dataBase64, "base64"),
  ).perpAssetMapKey;
  const mapBytes = unpack("fixtures/perp-asset-map-public.bin.gz");
  const sol = decodePerpAssetMap(mapBytes).metadata.entries.find((entry) => entry.key === "SOL");
  if (!sol) throw new Error("public Phoenix SOL market missing");
  const book = sol.value.staticMarketParams.marketAccount;
  const spline = await getPhoenixSplineCollectionAddress(book);
  for (const [key, bytes] of /** @type {Array<[string, Uint8Array]>} */ ([
    [mapKey, mapBytes],
    [book, unpack("fixtures/sol-orderbook-public.bin.gz")],
  ])) {
    await jsonRpc(rpcUrl, "surfnet_setAccount", [
      key,
      {
        lamports: 30_000_000,
        data: getBase16Decoder().decode(bytes),
        owner: PHOENIX_PROGRAM_ADDRESS,
        executable: false,
      },
    ]);
  }
  return { market: { SOL: { ...SOL_MARKET, marketPubkey: book, splinePubkey: spline } } };
};
