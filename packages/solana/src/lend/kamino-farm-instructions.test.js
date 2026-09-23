// @ts-check
import { describe, expect, test } from "bun:test";
import { address, getBase58Codec } from "@solana/kit";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { kaminoDepositSdk } from "./kamino-deposit-facts.js";
import {
  checkFarmRows,
  collateralFarmInstructions,
  farmUserAddress,
  FARMS_PROGRAM_ID,
  FARM_USER_STATE_SIZE,
} from "./kamino-farm-instructions.js";

const addr = (byte) => getBase58Codec().decode(new Uint8Array(32).fill(byte));

describe("pinned Kamino collateral-farm path [integration]", () => {
  test("derives the SDK farm user PDA; skips reserves without a farm", async () => {
    const sdk = await kaminoDepositSdk();
    const farm = addr(8);
    const obligation = addr(9);
    expect(await farmUserAddress(sdk, farm, obligation)).toBe(
      await sdk.obligationFarmStatePda(address(farm), address(obligation)),
    );
    expect(await farmUserAddress(sdk, null, obligation)).toBeNull();
    expect(FARM_USER_STATE_SIZE).toBe(920);
  });

  test("missing farm is rejected, missing user state initializes, existing user state skips init", () => {
    expect(checkFarmRows(null, null, true).status).toBe("reject");
    expect(checkFarmRows({ owner: KLEND_PROGRAM_ID }, null, true).status).toBe("reject");
    expect(
      checkFarmRows({ owner: FARMS_PROGRAM_ID }, { owner: KLEND_PROGRAM_ID }, true).status,
    ).toBe("reject");
    expect(checkFarmRows({ owner: FARMS_PROGRAM_ID }, null, true)).toEqual({
      status: "ok",
      initializeFarm: true,
    });
    expect(checkFarmRows({ owner: FARMS_PROGRAM_ID }, { owner: FARMS_PROGRAM_ID }, true)).toEqual({
      status: "ok",
      initializeFarm: false,
    });
    expect(checkFarmRows(null, null, false)).toEqual({ status: "ok", initializeFarm: false });
  });

  test("initializes and refreshes in the pinned SDK account order, without fallback programs", async () => {
    const sdk = await kaminoDepositSdk();
    const owner = addr(1);
    const parts = {
      intent: { market: addr(2), owner },
      signer: /** @type {any} */ ({ address: owner }),
      obligation: addr(3),
      reserve: { reserve: addr(4), lendingMarketAuthority: addr(5), farmCollateral: addr(6) },
      farmUser: await farmUserAddress(sdk, addr(6), addr(3)),
      initializeFarm: true,
    };
    const ixs = collateralFarmInstructions(sdk, parts);
    expect(ixs.init).toHaveLength(1);
    expect(ixs.refresh).toHaveLength(1);
    expect(ixs.init[0].programAddress).toBe(KLEND_PROGRAM_ID);
    expect(ixs.refresh[0].programAddress).toBe(KLEND_PROGRAM_ID);
    expect(ixs.init[0].accounts.map((a) => a.address)).toContain(FARMS_PROGRAM_ID);
    expect(ixs.refresh[0].accounts.map((a) => a.address)).toContain(parts.farmUser);
    expect(ixs.init[0].data.at(-1)).toBe(0);
    expect(ixs.refresh[0].data.at(-1)).toBe(0);
    expect(collateralFarmInstructions(sdk, { ...parts, initializeFarm: false }).init).toHaveLength(
      0,
    );
    expect(collateralFarmInstructions(sdk, { ...parts, farmUser: null }).refresh).toHaveLength(0);
  });
});
