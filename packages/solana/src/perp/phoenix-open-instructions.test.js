// @ts-check
import { expect, test } from "bun:test";
import {
  decodeGlobalConfiguration,
  getPlaceMarketOrderDecoder,
  PHOENIX_PROGRAM_ADDRESS,
  SelfTradeBehavior,
  Side,
  OrderFlags,
} from "@ellipsis-labs/rise";
import globalRaw from "./fixtures/global-public.json";
import { buildOpenInstruction } from "./phoenix-open-instructions.js";

const global = decodeGlobalConfiguration(Buffer.from(globalRaw.dataBase64, "base64"));
const owner = "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f";
const trader = "DnNrzdydJpFhtwxZpebGF5ozCajsqpXbPJMKYBvkyWuS";
const marketAddress = "71Si24E4uc3oCaPbPZTozC1ptSNNqygjjebxSmErSsC2";

/** @param {"long" | "short"} direction */
const instruction = (direction) =>
  buildOpenInstruction({
    owner,
    trader,
    exchange: {
      perpAssetMap: global.perpAssetMapKey,
      globalTraderIndex: [global.globalTraderIndexHeaderKey],
      activeTraderBuffer: [global.activeTraderBufferHeaderKey],
    },
    market: { marketAddress, splineCollection: PHOENIX_PROGRAM_ADDRESS },
    order: {
      side: direction,
      priceInTicks: 15_025n,
      numBaseLots: 19n,
      numQuoteLots: 30_000_000n,
      lastValidSlot: 116n,
    },
  });

test("Phoenix open [integration] SDK-built IOC wire encodes finite price, two lot caps, partial fills and no persistent order", () => {
  for (const direction of /** @type {const} */ (["long", "short"])) {
    const ix = instruction(direction);
    expect(ix.programAddress).toBe(PHOENIX_PROGRAM_ADDRESS);
    const packet = getPlaceMarketOrderDecoder().decode(ix.data);
    expect(packet.side).toBe(direction === "long" ? Side.Bid : Side.Ask);
    expect(packet.priceInTicks).toBe(15_025n);
    expect(packet.numBaseLots).toBe(19n);
    expect(packet.numQuoteLots).toBe(30_000_000n);
    expect(packet.minBaseLotsToFill).toBe(1n);
    expect(packet.minQuoteLotsToFill).toBe(1n);
    expect(packet.orderFlags).toBe(OrderFlags.None);
    expect(packet.selfTradeBehavior).toBe(SelfTradeBehavior.Abort);
    expect(packet.matchLimit).toBeNull();
    expect(packet.cancelExisting).toBe(false);
    expect(packet.lastValidSlot).toBe(116n);
    expect(ix.accounts.filter((meta) => meta.role >= 2).map((meta) => meta.address)).toEqual([
      owner,
    ]);
  }
});
