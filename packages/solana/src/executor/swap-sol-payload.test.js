// @ts-check
import { describe, expect, test } from "bun:test";
import { getU16Codec, getU32Codec, getU64Codec } from "@solana/kit";
import { AMOUNT, OUT_AMOUNT } from "../swap/jupiter-swap-build-bodies.js";
import { ROUTE_DISCRIMINATOR } from "../swap/jupiter-swap-build-swapdata.js";
import { reasonOf, runBranch, withSwapData } from "./swap-sol-driver.js";

/** @param {bigint} input @param {bigint} output @param {number} [slippageBps] */
const routeData = (input, output, slippageBps = 50) =>
  Uint8Array.of(
    ...ROUTE_DISCRIMINATOR,
    ...getU32Codec().encode(0),
    ...getU64Codec().encode(input),
    ...getU64Codec().encode(output),
    ...getU16Codec().encode(slippageBps),
    ...getU16Codec().encode(0),
  );

describe("the swap payload is bound to the validated intent before signing", () => {
  test("an embedded input amount other than the requested one is refused", async () => {
    const { error, requests } = await runBranch(
      "execute",
      withSwapData([...routeData(BigInt(AMOUNT) + 1n, BigInt(OUT_AMOUNT))]),
    );
    expect(reasonOf(error)).toBe("swap instruction data did not carry the requested input amount");
    expect(requests).toHaveLength(1);
  });

  test("an embedded quoted output other than the envelope's is refused", async () => {
    const { error } = await runBranch(
      "execute",
      withSwapData([...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT) - 1n)]),
    );
    expect(reasonOf(error)).toBe("swap instruction data did not carry the quoted envelope output");
  });

  test("embedded slippage other than the Action maximum is refused", async () => {
    const bytes = [...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT), 51)];
    const { error, requests } = await runBranch("execute", withSwapData(bytes));
    expect(reasonOf(error)).toBe(
      "swap instruction data did not carry the requested maximum slippage",
    );
    expect(requests).toHaveLength(1);
  });

  test("an unknown discriminator is refused as an unsupported layout", async () => {
    const bytes = [...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT))];
    bytes[0] = (bytes[0] + 1) % 256;
    const { error } = await runBranch("execute", withSwapData(bytes));
    expect(reasonOf(error)).toBe(
      "swap instruction data was not the supported Jupiter route layout",
    );
  });

  test("truncated swap data is refused as an unsupported layout", async () => {
    const bytes = [...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT))].slice(0, 31);
    const { error } = await runBranch("execute", withSwapData(bytes));
    expect(reasonOf(error)).toBe(
      "swap instruction data was not the supported Jupiter route layout",
    );
  });

  test("an amount beyond u64 is refused before any build request", async () => {
    const { error, requests } = await runBranch("execute", undefined, {
      amount: "18446744073709551616",
    });
    expect(reasonOf(error)).toBe("swap amount exceeded the u64 bound the executor can assemble");
    expect(requests).toHaveLength(0);
  });
});
