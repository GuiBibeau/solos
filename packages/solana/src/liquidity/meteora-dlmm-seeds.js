// @ts-check
/**
 * Seed Meteora DLMM accounts onto an offline Surfnet so the real adapter can run without a
 * live pair. The program itself is never invoked.
 */
import { accountWriter } from "./liquidity-seeds.js";
import { mintBytes, randomAddress } from "./liquidity-token-fixture.js";
import { binArrayAddress } from "./meteora-dlmm-bins.js";
import {
  meteoraBinArrayBytes,
  meteoraPairBytes,
  meteoraPositionBytes,
} from "./meteora-dlmm-bytes.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Seed one LbPair and its two mints. Decimals live on the mints; the pair account has none.
 * @param {string} rpcUrl
 * @param {Parameters<typeof meteoraPairBytes>[0] & { pair?: string; accountOwner?: string;
 *   mintOwner?: string; decimalsX?: number; decimalsY?: number }} o
 */
export const seedMeteoraPair = async (rpcUrl, o) => {
  const pair = o.pair ?? randomAddress();
  const write = accountWriter(rpcUrl);
  const mintOwner = o.mintOwner ?? TOKEN_PROGRAM;
  await Promise.all([
    write(pair, o.accountOwner ?? METEORA_DLMM_PROGRAM, meteoraPairBytes(o)),
    write(o.mintX, mintOwner, mintBytes(o.decimalsX ?? 9)),
    write(o.mintY, mintOwner, mintBytes(o.decimalsY ?? 6)),
  ]);
  return pair;
};

/**
 * Seed one PositionV2 at an explicit account address. Identity is that pubkey, not an NFT.
 * @param {string} rpcUrl
 * @param {Parameters<typeof meteoraPositionBytes>[0] & { position?: string; accountOwner?: string }} o
 */
export const seedMeteoraPosition = async (rpcUrl, o) => {
  const position = o.position ?? randomAddress();
  await accountWriter(rpcUrl)(
    position,
    o.accountOwner ?? METEORA_DLMM_PROGRAM,
    meteoraPositionBytes(o),
  );
  return position;
};

/**
 * Seed one BinArray at its derived PDA. `declaredPair` overrides the pair written into the
 * header when a test needs a mismatched pair at the right address.
 * @param {string} rpcUrl
 * @param {Omit<Parameters<typeof meteoraBinArrayBytes>[0], "lbPair"> & { lbPair: string;
 *   declaredPair?: string; accountOwner?: string }} o
 */
export const seedMeteoraBinArray = async (rpcUrl, o) => {
  const binArray = await binArrayAddress(o.lbPair, o.index);
  const bytes = meteoraBinArrayBytes({ ...o, lbPair: o.declaredPair ?? o.lbPair });
  await accountWriter(rpcUrl)(binArray, o.accountOwner ?? METEORA_DLMM_PROGRAM, bytes);
  return binArray;
};
