import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ELFA_BASE_URL,
  DEFAULT_JUPITER_BASE_URL,
  deriveWsUrl,
  elfaBaseUrl,
  jupiterBaseUrl,
} from "./env.js";

// Pure URL parsing only: no fixture store, no lifecycle, no `loadSolanaEnv`, so unit scope never
// touches the filesystem or a credential store. Store-backed resolution lives in the
// [integration] suites (`env.test.js`, `env-profile.test.js`).
describe("solana env url parsing", () => {
  test("derives ws url: local port+1, remote same host", () => {
    expect(deriveWsUrl("http://127.0.0.1:8899")).toBe("ws://127.0.0.1:8900");
    expect(deriveWsUrl("https://mainnet.helius-rpc.com/?api-key=x")).toBe(
      "wss://mainnet.helius-rpc.com/?api-key=x",
    );
  });

  test("provider base urls default to the production endpoints", () => {
    expect(DEFAULT_ELFA_BASE_URL).toBe("https://api.elfa.ai");
    expect(DEFAULT_JUPITER_BASE_URL).toBe("https://api.jup.ag");
    expect(elfaBaseUrl(undefined)).toBe(DEFAULT_ELFA_BASE_URL);
    expect(jupiterBaseUrl(undefined)).toBe(DEFAULT_JUPITER_BASE_URL);
  });

  test("provider base urls normalize a trailing slash", () => {
    expect(elfaBaseUrl("https://api.elfa.ai/")).toBe("https://api.elfa.ai");
    expect(jupiterBaseUrl("https://api.jup.ag/")).toBe("https://api.jup.ag");
  });

  test("provider base urls allow plain http only on loopback hosts", () => {
    expect(elfaBaseUrl("http://127.0.0.1:8999")).toBe("http://127.0.0.1:8999");
    expect(elfaBaseUrl("http://localhost:8999/v1")).toBe("http://localhost:8999/v1");
    const OFF_LOOPBACK_ELFA = "api.elfa.ai";
    expect(() => elfaBaseUrl(`http://${OFF_LOOPBACK_ELFA}`)).toThrow(/ELFA_BASE_URL/);
    expect(() => elfaBaseUrl("ftp://api.elfa.ai")).toThrow(/ELFA_BASE_URL/);
    expect(jupiterBaseUrl("http://127.0.0.1:8999")).toBe("http://127.0.0.1:8999");
    expect(jupiterBaseUrl("http://localhost:8999/")).toBe("http://localhost:8999");
    const OFF_LOOPBACK_JUPITER = "api.jup.ag";
    expect(() => jupiterBaseUrl(`http://${OFF_LOOPBACK_JUPITER}`)).toThrow(/JUPITER_BASE_URL/);
    expect(() => jupiterBaseUrl("ftp://api.jup.ag")).toThrow(/JUPITER_BASE_URL/);
  });
});
