// @ts-check
import {
  baseLots,
  buildPlaceMarketOrderIxResolved,
  getPlaceMarketOrderDecoder,
  OrderFlags,
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_LOG_AUTHORITY_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  quoteLots,
  SelfTradeBehavior,
  Side,
  ticks,
} from "@ellipsis-labs/rise";
import { address } from "@solana/kit";
import { BuildRejected } from "@solos/core";

/** @typedef {{owner:string;trader:string;exchange:{perpAssetMap:string;globalTraderIndex:string[];activeTraderBuffer:string[]};market:{marketAddress:string;splineCollection:string};order:{side:"long" | "short";priceInTicks:bigint;numBaseLots:bigint;numQuoteLots:bigint;lastValidSlot:bigint}}} Input */

/** @param {Input["order"]} order */
const orderPacket = (order) => ({
  side: order.side === "long" ? Side.Bid : Side.Ask,
  priceInTicks: ticks(order.priceInTicks),
  numBaseLots: baseLots(order.numBaseLots),
  numQuoteLots: quoteLots(order.numQuoteLots),
  minBaseLotsToFill: baseLots(1n),
  minQuoteLotsToFill: quoteLots(1n),
  selfTradeBehavior: SelfTradeBehavior.Abort,
  matchLimit: null,
  clientOrderId: 0n,
  lastValidSlot: order.lastValidSlot,
  orderFlags: OrderFlags.None,
  cancelExisting: false,
});

/** @param {import("@ellipsis-labs/rise").ImmediateOrCancelOrderPacket} packet @param {Input["order"]} order */
const isPriceBounded = (packet, order) =>
  packet.side === (order.side === "long" ? Side.Bid : Side.Ask) &&
  packet.priceInTicks === order.priceInTicks &&
  packet.lastValidSlot === order.lastValidSlot;

/** @param {import("@ellipsis-labs/rise").ImmediateOrCancelOrderPacket} packet @param {Input["order"]} order */
const isQuantityBounded = (packet, order) =>
  packet.numBaseLots === order.numBaseLots && packet.numQuoteLots === order.numQuoteLots;

/** @param {import("@ellipsis-labs/rise").ImmediateOrCancelOrderPacket} packet */
const isIocSafe = (packet) =>
  packet.minBaseLotsToFill === 1n &&
  packet.minQuoteLotsToFill === 1n &&
  packet.orderFlags === OrderFlags.None &&
  !packet.cancelExisting &&
  packet.selfTradeBehavior === SelfTradeBehavior.Abort &&
  packet.matchLimit === null &&
  packet.clientOrderId === 0n;

/** @param {import("@ellipsis-labs/rise").InstructionsWithAccountsAndData} ix @param {Input} input */
const isAccountBounded = (ix, input) => {
  const metas = new Set(ix.accounts.map((meta) => meta.address));
  const signers = ix.accounts.filter((meta) => meta.role >= 2);
  const required = [
    input.owner,
    input.trader,
    input.market.marketAddress,
    input.market.splineCollection,
    input.exchange.perpAssetMap,
  ];
  return (
    required.every((key) => metas.has(address(key))) &&
    signers.length === 1 &&
    signers[0]?.address === input.owner
  );
};

/** @param {import("@ellipsis-labs/rise").InstructionsWithAccountsAndData} ix @param {Input} input */
const assertInstruction = (ix, input) => {
  const packet = getPlaceMarketOrderDecoder().decode(ix.data);
  if (
    ix.programAddress !== PHOENIX_PROGRAM_ADDRESS ||
    !isPriceBounded(packet, input.order) ||
    !isQuantityBounded(packet, input.order) ||
    !isIocSafe(packet) ||
    !isAccountBounded(ix, input)
  )
    throw new BuildRejected({
      reason: "Phoenix IOC instruction does not match the bounded intent",
    });
};

/** Pinned Rise 0.5.26 builds the actual IOC program instruction; a raw API instruction is
 * never accepted. Decode every bounded field and signer before signing.
 * @param {Input} input */
export const buildOpenInstruction = (input) => {
  const resolved =
    /** @type {import("@ellipsis-labs/rise").BuildPlaceMarketOrderIxResolvedInput} */ (
      /** @type {unknown} */ ({
        exchange: {
          phoenixProgramAddress: PHOENIX_PROGRAM_ADDRESS,
          logAuthorityAddress: PHOENIX_LOG_AUTHORITY_ADDRESS,
          globalConfigurationAddress: PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
          perpAssetMap: input.exchange.perpAssetMap,
          globalTraderIndex: input.exchange.globalTraderIndex,
          activeTraderBuffer: input.exchange.activeTraderBuffer,
        },
        market: input.market,
        trader: { authority: input.owner, traderAccount: input.trader },
        orderPacket: orderPacket(input.order),
      })
    );
  const ix = buildPlaceMarketOrderIxResolved(resolved);
  assertInstruction(ix, input);
  return {
    programAddress: address(ix.programAddress),
    accounts: ix.accounts.map((meta) => ({ address: address(meta.address), role: meta.role })),
    data: Uint8Array.from(ix.data),
  };
};
