// @ts-check
import { describe, expect, test } from "bun:test";
import { isTrustedVerificationUrl } from "./login-privy.js";

const AUTH = "https://auth.privy.io";
const PRIVY_HOST = "auth.privy.io";
const LOOPBACK = "127.0.0.1";

describe("Privy verification URL allowlist", () => {
  test("accepts the configured auth host and any https privy.io host", () => {
    expect(isTrustedVerificationUrl("https://auth.privy.io/device?c=ABCD", AUTH)).toBe(true);
    expect(isTrustedVerificationUrl("https://agents.privy.io/approve/ABCD", AUTH)).toBe(true);
  });

  test("accepts a loopback fixture only when it is the configured host", () => {
    const fixture = `http://${LOOPBACK}:4321`;
    expect(isTrustedVerificationUrl(`${fixture}/device`, fixture)).toBe(true);
    expect(isTrustedVerificationUrl(`${fixture}/device`, AUTH)).toBe(false);
  });

  test("refuses other hosts, lookalikes, downgrades, and non-URLs", () => {
    expect(isTrustedVerificationUrl("https://privy.io.attacker.example/device", AUTH)).toBe(false);
    expect(isTrustedVerificationUrl("https://notprivy.io/device", AUTH)).toBe(false);
    expect(isTrustedVerificationUrl(`http://${PRIVY_HOST}/device`, AUTH)).toBe(false);
    expect(isTrustedVerificationUrl("file:///etc/passwd", AUTH)).toBe(false);
    expect(isTrustedVerificationUrl("not a url", AUTH)).toBe(false);
  });
});
