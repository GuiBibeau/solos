// @ts-check
import { describe, expect, test } from "bun:test";
import { loadSolanaEnv } from "../env.js";
import { KAMINO_MAIN_MARKET } from "./kamino-addresses.js";

const MAIN_RPC = "http://127.0.0.1:8899";
/** A real 32-byte base58 address standing in for a second, supported market. */
const OTHER_MARKET = "EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih";

// A signer from env keeps profile resolution (and its credential-store I/O) out of these
// calls, so market parsing is provable as pure domain logic in the offline unit gate.
const env = (overrides = {}) => ({
  SOLANA_RPC_URL: MAIN_RPC,
  SOLOS_SIGNER_PRIVATE_KEY: "x",
  ...overrides,
});

describe("KAMINO_LENDING_MARKET env parsing", () => {
  test("absent or empty selects the pinned Kamino Main Market", () => {
    expect(loadSolanaEnv(env()).kamino.market).toBe(KAMINO_MAIN_MARKET);
    expect(loadSolanaEnv(env({ KAMINO_LENDING_MARKET: "" })).kamino.market).toBe(
      KAMINO_MAIN_MARKET,
    );
  });

  test("a valid override selects that market verbatim", () => {
    expect(loadSolanaEnv(env({ KAMINO_LENDING_MARKET: OTHER_MARKET })).kamino.market).toBe(
      OTHER_MARKET,
    );
  });

  test("a value that is not a 32-byte base58 address fails at startup", () => {
    expect(() => loadSolanaEnv(env({ KAMINO_LENDING_MARKET: "not-a-market" }))).toThrow(
      /KAMINO_LENDING_MARKET/,
    );
    expect(() => loadSolanaEnv(env({ KAMINO_LENDING_MARKET: "1111" }))).toThrow(
      /KAMINO_LENDING_MARKET/,
    );
  });
});
