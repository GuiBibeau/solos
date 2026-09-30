// @ts-check
import { describe, expect, test } from "bun:test";
import { privyConfig } from "./config.js";

const LOOPBACK = "127.0.0.1";
const REMOTE = "auth.example.com";

describe("privyConfig", () => {
  test("defaults to Privy's https hosts", () => {
    const config = privyConfig({});
    expect(config.authBaseUrl).toBe("https://auth.privy.io");
    expect(config.agentUrl).toBe("https://agents.privy.io");
  });

  test("accepts https overrides and loopback http fixtures, trimming a trailing slash", () => {
    expect(privyConfig({ PRIVY_API_BASE_URL: "https://auth.example.com/" }).authBaseUrl).toBe(
      "https://auth.example.com",
    );
    const fixture = `http://${LOOPBACK}:5555`;
    expect(privyConfig({ PRIVY_API_BASE_URL: fixture }).authBaseUrl).toBe(fixture);
  });

  test("refuses a plain-http remote host for either endpoint", () => {
    expect(() => privyConfig({ PRIVY_API_BASE_URL: `http://${REMOTE}` })).toThrow(
      "PRIVY_API_BASE_URL must use https",
    );
    expect(() => privyConfig({ PRIVY_AGENT_URL: `http://${REMOTE}` })).toThrow(
      "PRIVY_AGENT_URL must use https",
    );
  });
});
