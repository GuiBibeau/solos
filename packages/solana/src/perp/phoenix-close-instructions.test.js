// @ts-check
import { expect, test } from "bun:test";
import {
  decodeGlobalConfiguration,
  getPlaceMarketOrderDecoder,
  OrderFlags,
  PHOENIX_PROGRAM_ADDRESS,
  Side,
} from "@ellipsis-labs/rise";
import globalRaw from "./fixtures/global-public.json";
import { buildCloseInstruction } from "./phoenix-close-instructions.js";

const global = decodeGlobalConfiguration(Buffer.from(globalRaw.dataBase64, "base64"));
const owner = "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f";
const trader = "DnNrzdydJpFhtwxZpebGF5ozCajsqpXbPJMKYBvkyWuS";
const book = "71Si24E4uc3oCaPbPZTozC1ptSNNqygjjebxSmErSsC2";

test("Phoenix reduce-only close [integration] SDK builds both opposite-side IOC packets with REDUCE_ONLY", () => {
  for (const [side, expected] of /** @type {const} */ ([
    ["short", Side.Ask],
    ["long", Side.Bid],
  ])) {
    const ix = buildCloseInstruction({
      owner,
      trader,
      exchange: {
        perpAssetMap: global.perpAssetMapKey,
        globalTraderIndex: [global.globalTraderIndexHeaderKey],
        activeTraderBuffer: [global.activeTraderBufferHeaderKey],
      },
      market: { marketAddress: book, splineCollection: PHOENIX_PROGRAM_ADDRESS },
      order: {
        side,
        priceInTicks: 12_001n,
        numBaseLots: 100n,
        numQuoteLots: null,
        lastValidSlot: 116n,
      },
    });
    expect(ix.programAddress).toBe(PHOENIX_PROGRAM_ADDRESS);
    const packet = getPlaceMarketOrderDecoder().decode(ix.data);
    expect(packet.side).toBe(expected);
    expect(packet.priceInTicks).toBe(12_001n);
    expect(packet.numBaseLots).toBe(100n);
    expect(packet.numQuoteLots).toBeNull();
    expect(packet.orderFlags).toBe(OrderFlags.ReduceOnly);
    expect(packet.lastValidSlot).toBe(116n);
    expect(ix.accounts.filter((meta) => meta.role >= 2).map((meta) => meta.address)).toEqual([
      owner,
    ]);
  }
});
