// @ts-check
import { describe, expect, test } from "bun:test";
import { getBase58Codec } from "@solana/kit";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { kaminoDepositSdk } from "./kamino-deposit-facts.js";
import { refreshReserveInstruction } from "./kamino-refresh-reserve.js";

/** The same pinned SDK instruction builder runs for both deposit and withdrawal. */
describe("Kamino reserve oracle refresh [integration]", () => {
  test("uses configured Scope and Switchboard accounts, not program-ID placeholders", async () => {
    const sdk = await kaminoDepositSdk();
    const scope = getBase58Codec().decode(new Uint8Array(32).fill(13));
    const switchboard = getBase58Codec().decode(new Uint8Array(32).fill(14));
    const ix = refreshReserveInstruction(sdk, {
      market: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
      reserve: "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59",
      oracles: {
        pythOracle: null,
        switchboardPriceOracle: switchboard,
        switchboardTwapOracle: null,
        scopePrices: scope,
      },
    });
    expect(ix.programAddress).toBe(KLEND_PROGRAM_ID);
    expect(ix.accounts[2]?.address).toBe(KLEND_PROGRAM_ID);
    expect(ix.accounts[3]?.address).toBe(switchboard);
    expect(ix.accounts[5]?.address).toBe(scope);
    expect(ix.accounts[5]?.role).toBe(0);
  });
});
