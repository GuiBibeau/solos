// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  BAD_MINT,
  KEY,
  MINT,
  okBody,
  priceFailure,
  priceThrough,
  startFixture,
} from "./jupiter-fixture.js";

describe("JupiterPriceLive success and validation [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("sends one documented price request and normalizes usdPrice to an exact decimal string", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const before = Date.now();
    const price = await priceThrough(fixture, MINT);
    expect(fixture.requests).toHaveLength(1);
    const [request] = fixture.requests;
    expect(request.method).toBe("GET");
    const url = new URL(request.url);
    expect(url.pathname).toBe("/price/v3");
    expect(url.searchParams.get("ids")).toBe(MINT);
    expect(request.ids).toBe(MINT);
    expect(request.key).toBe(KEY);
    expect(request.url.includes(KEY)).toBe(false);
    expect(price.mint).toBe(MINT);
    expect(price.priceUsd).toBe("100.46852810203305");
    expect(price.source).toBe("jupiter");
    expect(price.at).toBeGreaterThanOrEqual(before);
    expect(JSON.stringify(price).includes("blockId")).toBe(false);
  });

  test("treats a zero price as a price, never as unavailable", async () => {
    fixture = startFixture([{ body: okBody(0) }]);
    const price = await priceThrough(fixture, MINT);
    expect(price.priceUsd).toBe("0");
    expect(fixture.requests).toHaveLength(1);
  });

  test("reports a mint omitted from a 200 object as PriceUnavailable, never zero", async () => {
    fixture = startFixture([{ body: {} }]);
    const failure = await priceFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "PriceUnavailable",
      mint: MINT,
      source: "jupiter",
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("rejects an invalid mint before any HTTP", async () => {
    fixture = startFixture([{ body: okBody() }]);
    expect((await priceFailure(fixture, {}, BAD_MINT))?._tag).toBe("PriceInputInvalid");
    expect(fixture.requests).toHaveLength(0);
  });

  test("fails pre-HTTP without a key, blank keys included", async () => {
    fixture = startFixture([{ body: okBody() }]);
    expect((await priceFailure(fixture, { apiKey: "" }))?._tag).toBe("PriceConfigMissing");
    expect((await priceFailure(fixture, { apiKey: " ".repeat(3) }))?._tag).toBe(
      "PriceConfigMissing",
    );
    expect(fixture.requests).toHaveLength(0);
  });
});
