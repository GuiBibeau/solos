// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { address, createSolanaRpc, getAddressEncoder, getBase16Decoder } from "@solana/kit";
import { Cause, Effect, Option } from "effect";
import { ensureSurfnet, jsonRpc, randomSeed, seedAddress, USDC_MINT } from "../surfnet/index.js";
import { validateReserveLayout } from "./kamino-market-reader.js";

const KLEND_PROGRAM = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const MARKET_OFFSET = 32;
const LIQUIDITY_MINT_OFFSET = 128;
const addressEncoder = getAddressEncoder();
const hexDecoder = getBase16Decoder();

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
});

/** @param {string} market @param {string} mint */
const malformedReserveBytes = (market, mint) => {
  const bytes = new Uint8Array(160);
  bytes.set(addressEncoder.encode(address(market)), MARKET_OFFSET);
  bytes.set(addressEncoder.encode(address(mint)), LIQUIDITY_MINT_OFFSET);
  return hexDecoder.decode(bytes);
};

describe("Kamino reserve candidate layout preflight [integration]", () => {
  test("classifies a matching reserve omitted by SDK size filters", async () => {
    const market = await seedAddress(randomSeed());
    const reserve = await seedAddress(randomSeed());
    await jsonRpc(surfnet.rpcUrl, "surfnet_setAccount", [
      reserve,
      {
        lamports: 1_000_000,
        data: malformedReserveBytes(market, USDC_MINT),
        owner: KLEND_PROGRAM,
        executable: false,
      },
    ]);
    const result = await Effect.runPromiseExit(
      validateReserveLayout(createSolanaRpc(surfnet.rpcUrl), {
        market,
        mint: USDC_MINT,
        origin: surfnet.rpcUrl,
      }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") return;
    const failure = Cause.failureOption(result.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (Option.isSome(failure)) {
      expect(failure.value).toMatchObject({
        _tag: "LendingLayoutUnsupported",
        reserve,
      });
    }
  });
});
