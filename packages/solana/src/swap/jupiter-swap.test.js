// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT, okBody } from "./jupiter-swap-bodies.js";
import { quoteFailure, quoteThrough, startFixture } from "./jupiter-swap-fixture.js";

/**
 * The quote request the adapter sends: exactly one documented quote-only GET pinned to Metis,
 * the key in the header only, and input/config gating before any HTTP.
 */

describe("JupiterSwapLive quote request [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("sends exactly one documented quote-only GET pinned to Metis, key in the header only", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(fixture.requests).toHaveLength(1);
    const [request] = fixture.requests;
    expect(request.method).toBe("GET");
    const url = new URL(request.url);
    expect(url.pathname).toBe("/swap/v2/order");
    expect(url.searchParams.get("inputMint")).toBe(INPUT_MINT);
    expect(url.searchParams.get("outputMint")).toBe(OUTPUT_MINT);
    expect(url.searchParams.get("amount")).toBe(AMOUNT);
    expect(url.searchParams.get("slippageBps")).toBe("50");
    expect(url.searchParams.get("swapMode")).toBe("ExactIn");
    expect(url.searchParams.get("excludeRouters")).toBe("jupiterz,dflow,okx");
    expect(request.taker).toBeNull();
    expect(request.key).toBe(KEY);
    expect(request.url.includes(KEY)).toBe(false);
    expect(quote.inputMint).toBe(INPUT_MINT);
  });

  test("makes no submit call: every recorded request is a GET", async () => {
    fixture = startFixture([{ body: okBody() }]);
    await quoteThrough(fixture);
    expect(fixture.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("follows a redirect that stays on the same origin and sends the key there", async () => {
    fixture = startFixture([{ status: 302, location: "/moved" }, { body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(fixture.requests).toHaveLength(2);
    expect(new URL(fixture.requests[1].url).pathname).toBe("/moved");
    expect(fixture.requests[1].key).toBe(KEY);
    expect(quote.inAmount).toBe(AMOUNT);
  });

  test("echoes 30+ digit base-unit amounts exactly, request and quote alike", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(fixture.requests[0].amount).toBe(AMOUNT);
    expect(quote.inAmount).toBe(AMOUNT);
    expect(AMOUNT.length).toBeGreaterThan(30);
  });

  test("rejects an invalid mint, a zero amount, and identical mints before any HTTP", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const invalid = { inputMint: "not-a-mint", outputMint: OUTPUT_MINT, amount: AMOUNT };
    expect((await quoteFailure(fixture, {}, invalid))?._tag).toBe("QuoteInputInvalid");
    const zero = { inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: "0" };
    expect((await quoteFailure(fixture, {}, zero))?._tag).toBe("QuoteInputInvalid");
    const same = { inputMint: INPUT_MINT, outputMint: INPUT_MINT, amount: AMOUNT };
    expect((await quoteFailure(fixture, {}, same))?._tag).toBe("QuoteInputInvalid");
    expect(fixture.requests).toHaveLength(0);
  });

  test("fails pre-HTTP without a key, and says where the key comes from", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const blank = await quoteFailure(fixture, { apiKey: "" });
    expect(blank?._tag).toBe("QuoteConfigMissing");
    expect(blank?.reason).toContain("JUPITER_API_KEY is not set");
    expect(blank?.remedy).toContain("portal.jup.ag");
    expect((await quoteFailure(fixture, { apiKey: " ".repeat(3) }))?._tag).toBe(
      "QuoteConfigMissing",
    );
    expect(fixture.requests).toHaveLength(0);
  });
});
