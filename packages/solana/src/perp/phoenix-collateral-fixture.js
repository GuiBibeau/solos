// @ts-check
import { decodeGlobalConfiguration, decodeTrader } from "@ellipsis-labs/rise";
import { address, getAddressEncoder, getBase16Decoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/index.js";
import globalRaw from "./fixtures/global-public.json";
import traderRaw from "./fixtures/trader-public.json";
import { traderAddress } from "./perp-onboarder-live.js";

const encode = getAddressEncoder();
/** @param {string} key */
const addressBytes = (key) => encode.encode(address(key));
/** @param {Uint8Array} bytes @param {string} oldKey @param {string} newKey */
const replaceAddress = (bytes, oldKey, newKey) => {
  const from = addressBytes(oldKey);
  const to = addressBytes(newKey);
  let count = 0;
  for (let offset = 0; offset + 32 <= bytes.length; offset++) {
    if (from.some((byte, index) => bytes[offset + index] !== byte)) {
      continue;
    }

    bytes.set(to, offset);
    offset += 31;
    count += 1;
  }
  if (count === 0) throw new Error("public fixture missing expected authority or trader account");
};

/** @param {string} rpcUrl @param {string} key @param {{ owner:string; bytes:Uint8Array }} data */
const setAccount = (rpcUrl, key, { owner, bytes }) =>
  jsonRpc(rpcUrl, "surfnet_setAccount", [
    key,
    {
      lamports: 30_000_000,
      data: getBase16Decoder().decode(bytes),
      owner,
      executable: false,
    },
  ]);

/** Seed two PUBLIC account byte snapshots captured via `solos dev inspect account-data` on
 * configured RPC after #101 QA. Adapt the trader's two keys to the throwaway Surfpool signer.
 * @param {string} rpcUrl @param {string} authority @param {bigint} [collateral] */
export const seedPhoenixCollateralFixture = async (rpcUrl, authority, collateral = 0n) => {
  const trader = await traderAddress(authority);
  const traderBytes = Uint8Array.from(Buffer.from(traderRaw.dataBase64, "base64"));
  replaceAddress(traderBytes, traderRaw.account, trader);
  replaceAddress(traderBytes, "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f", authority);
  // Pinned Rise Trader layout: discriminator (8), sequence (16), key (32), authority (32), then i64 quote collateral.
  new DataView(traderBytes.buffer).setBigInt64(88, collateral, true);
  if (decodeTrader(traderBytes).state.quoteLotCollateral !== collateral)
    throw new Error("synthetic collateral did not decode at the pinned Trader offset");
  await setAccount(rpcUrl, trader, { owner: traderRaw.owner, bytes: traderBytes });
  const globalBytes = Uint8Array.from(Buffer.from(globalRaw.dataBase64, "base64"));
  await setAccount(rpcUrl, globalRaw.account, { owner: globalRaw.owner, bytes: globalBytes });
  return { trader, global: decodeGlobalConfiguration(globalBytes) };
};
