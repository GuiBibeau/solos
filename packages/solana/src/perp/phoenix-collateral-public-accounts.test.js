// @ts-check
import { expect, test } from "bun:test";
import {
  decodeGlobalConfiguration,
  decodeTrader,
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import globalRaw from "./fixtures/global-public.json";
import traderRaw from "./fixtures/trader-public.json";

const bytes = (encoded) => Uint8Array.from(Buffer.from(encoded, "base64"));

test("Phoenix collateral [integration] pinned public trader and global accounts decode with Rise 0.5.26", () => {
  const global = decodeGlobalConfiguration(bytes(globalRaw.dataBase64));
  const trader = decodeTrader(bytes(traderRaw.dataBase64));
  expect(globalRaw.owner).toBe(PHOENIX_PROGRAM_ADDRESS);
  expect(global.accountKey).toBe(PHOENIX_GLOBAL_CONFIGURATION_ADDRESS);
  expect(traderRaw.owner).toBe(PHOENIX_PROGRAM_ADDRESS);
  expect(trader.authority).toBe("E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f");
  expect(trader.key).toBe(traderRaw.account);
  expect(trader.traderPdaIndex).toBe(0);
  expect(trader.traderSubaccountIndex).toBe(0);
  expect(trader.state.quoteLotCollateral).toBe(0n);
  expect(global.canonicalTokenMintKey).not.toBe(USDC_MINT_ADDRESS);
});
