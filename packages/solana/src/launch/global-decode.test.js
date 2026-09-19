// @ts-check
import { describe, expect, test } from "bun:test";
import { decodeGlobalConfig } from "./global-config.js";
import { globalConfigBytes, INITIAL_REAL_TOKEN_RESERVES } from "./test-fixtures.js";

describe("global config decode", () => {
  test("the documented test-seed anchor reads from the stable prefix bytes 89..97", () => {
    const read = decodeGlobalConfig(globalConfigBytes());
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.initialRealTokenReserves).toBe(INITIAL_REAL_TOKEN_RESERVES);
    expect(read.initialRealTokenReserves).toBe(793_100_000_000_000n);
  });

  test("an account shorter than the stable prefix is malformed, not legacy", () => {
    for (const bytes of [89, 96]) {
      expect(decodeGlobalConfig(globalConfigBytes({ bytes }))).toMatchObject({
        status: "corrupt",
        reason: "Global config account is shorter than the stable layout prefix",
      });
    }
  });

  test("a flipped discriminator byte is not the Global config", () => {
    const bytes = globalConfigBytes();
    bytes[7] = 200;
    expect(decodeGlobalConfig(bytes)).toMatchObject({
      status: "corrupt",
      reason: "Global data does not carry the Global discriminator",
    });
  });

  test("a zero configuration cannot define progress and is rejected", () => {
    expect(decodeGlobalConfig(globalConfigBytes({ initialRealTokenReserves: 0n }))).toMatchObject({
      status: "corrupt",
      reason: "Global config sets zero initial real token reserves",
    });
  });

  test("an absent account is a distinct corrupt outcome, never a fabricated constant", () => {
    expect(decodeGlobalConfig(null)).toMatchObject({
      status: "corrupt",
      reason: "Global config account is absent",
    });
  });
});
