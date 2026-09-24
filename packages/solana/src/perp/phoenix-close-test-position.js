// @ts-check
import { decodeTrader, PHOENIX_PROGRAM_ADDRESS } from "@ellipsis-labs/rise";
import { getBase16Decoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/index.js";

/** The pinned Rise 0.5.26 Trader short-map has a 16-byte header and 40-byte entries.
 * @param {Uint8Array} bytes @param {bigint} lots */
const patchPosition = (bytes, lots) => {
  const before = decodeTrader(bytes);
  if (before.positions.len > 1n) throw new Error("offline Trader has unrelated positions");
  const offset = bytes.length - Number(before.positions.capacity) * 40 - 16;
  if (offset < 200 || before.positions.capacity < 1n)
    throw new Error("pinned Trader short-map layout changed");
  const data = new DataView(bytes.buffer);
  data.setBigUint64(offset, lots === 0n ? 0n : 1n, true);
  data.setBigUint64(offset + 16, 0n, true); // SOL asset ID zero.
  data.setBigInt64(offset + 24, lots, true);
  data.setBigInt64(offset + 32, 0n, true);
  data.setUint8(offset + 48, 1); // Matches the fixture position sequence.
  const state = decodeTrader(bytes);
  if (
    lots === 0n
      ? state.positions.entries.length > 0
      : state.positions.entries[0]?.value.baseLotPosition !== lots
  )
    throw new Error("pinned synthetic position did not decode");
  return state;
};

/** Seed a synthetic SOL position into the PUBLIC post-enrollment Trader binary fixture.
 * This is strictly for isolated offline Surfpool: no funded signer or production RPC.
 * @param {string} rpcUrl @param {string} trader @param {bigint} lots */
export const seedClosePosition = async (rpcUrl, trader, lots) => {
  const { value } = await jsonRpc(rpcUrl, "getAccountInfo", [trader, { encoding: "base64" }]);
  if (!value || value.owner !== PHOENIX_PROGRAM_ADDRESS)
    throw new Error("offline Trader account missing or misowned");
  const bytes = Uint8Array.from(Buffer.from(value.data[0], "base64"));
  const state = patchPosition(bytes, lots);
  await jsonRpc(rpcUrl, "surfnet_setAccount", [
    trader,
    {
      lamports: value.lamports,
      data: getBase16Decoder().decode(bytes),
      owner: PHOENIX_PROGRAM_ADDRESS,
      executable: false,
    },
  ]);
  return state;
};
