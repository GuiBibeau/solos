// @ts-check
import {
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import { AddressSchema } from "@solos/actions";
import { BuildRejected } from "@solos/core";
import { z } from "zod";

const Address = AddressSchema;
const Wire = z.object({
  slot: z.union([z.string().regex(/^(0|[1-9]\d*)$/), z.number().int().nonnegative()]),
  exchange: z.object({
    programId: Address,
    globalConfig: Address,
    usdcMint: Address,
    canonicalMint: Address,
    globalVault: Address,
    perpAssetMap: Address,
    withdrawQueue: Address,
    globalTraderIndex: z.array(Address).min(1).max(32),
    activeTraderBuffer: z.array(Address).min(1).max(32),
    withdrawalsAvailable: z.boolean(),
  }),
});

/** @param {unknown} body @param {bigint} chainSlot */
export const validatedExchange = (body, chainSlot) => {
  const parsed = Wire.safeParse(body);
  if (!parsed.success)
    throw new BuildRejected({ reason: "Phoenix exchange snapshot is incomplete" });
  const { exchange, slot } = parsed.data;
  if (
    exchange.programId !== PHOENIX_PROGRAM_ADDRESS ||
    exchange.globalConfig !== PHOENIX_GLOBAL_CONFIGURATION_ADDRESS ||
    exchange.usdcMint !== USDC_MINT_ADDRESS
  )
    throw new BuildRejected({
      reason: "Phoenix exchange program or USDC mint is not the pinned venue",
    });
  const observed = BigInt(slot);
  if (observed > chainSlot || chainSlot - observed > 12n)
    throw new BuildRejected({ reason: "Phoenix exchange snapshot is stale" });
  return exchange;
};
