// @ts-check
import {
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import { BuildRejected } from "@solos/core";
import { AddressSchema } from "@solos-sh/actions";
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
  if (observed > chainSlot)
    throw new BuildRejected({ reason: "Phoenix exchange snapshot is ahead of the configured RPC" });
  // Exchange keys are verified against live on-chain configuration and derived accounts by
  // readCollateralExchange, then against the exact transaction simulation. Unlike the separate
  // trader-risk snapshot, old exchange metadata alone cannot authorize a withdrawal.
  return exchange;
};
