// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import {
  AMOUNT,
  BODY,
  INPUT_MINT,
  KEY,
  OUTPUT_MINT,
  runSolos,
  solanaEnv,
  startSwapFixture,
  stderrJson,
} from "./swap-quote-fixture.js";

/**
 * Error and discovery scenarios: tool discovery works without a key, a missing key exits 1
 * with the tagged error before any provider access, and an echo-mismatching provider answer
 * surfaces as QuoteResponseInvalid.
 */

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startSwapFixture>} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startSwapFixture();
});

afterAll(() => fixture?.stop());

describe("`solos swap quote` error and discovery scenarios [integration]", () => {
  test("mcp list without a key still advertises every tool, the swap quote included", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], await solanaEnv(surfnet));
    expect(code).toBe(0);
    const names = JSON.parse(stdout).tools.map((/** @type {{ name: string }} */ t) => t.name);
    expect(names).toEqual([
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_swap_get_quote",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
  });

  test("swap quote without a key exits 1 with the tagged error, before provider access", async () => {
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(
      [
        "swap",
        "quote",
        "--input-mint",
        INPUT_MINT,
        "--output-mint",
        OUTPUT_MINT,
        "--amount",
        AMOUNT,
      ],
      { ...(await solanaEnv(surfnet)), JUPITER_BASE_URL: fixture.url },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "QuoteConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });

  test("an echo-mismatching provider answer exits 1 with QuoteResponseInvalid", async () => {
    const before = fixture.requests.length;
    fixture.respondWith(() => Response.json({ ...BODY, inAmount: "999" }));
    try {
      const { stdout, stderr, code } = await runSolos(
        [
          "swap",
          "quote",
          "--input-mint",
          INPUT_MINT,
          "--output-mint",
          OUTPUT_MINT,
          "--amount",
          AMOUNT,
        ],
        { ...(await solanaEnv(surfnet)), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
      );
      expect(code).not.toBe(0);
      expect(stdout).toBe("");
      expect(stderrJson(stderr)?.error).toMatchObject({ code: "QuoteResponseInvalid" });
    } finally {
      fixture.respondWith(() => Response.json(BODY));
    }
    expect(fixture.requests.length).toBe(before + 1);
  });
});
