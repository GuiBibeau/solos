// @ts-check
import { describe, expect, test } from "bun:test";
import { isAllowedEndpoint } from "./env-url.js";

const REMOTE = "rpc.example.com";

describe("isAllowedEndpoint", () => {
  test("https anywhere, plain http on loopback only, nothing else", () => {
    expect(isAllowedEndpoint(`https://${REMOTE}/v1/key`)).toBe(true);
    expect(isAllowedEndpoint("http://127.0.0.1:8899")).toBe(true);
    expect(isAllowedEndpoint("http://localhost:8899")).toBe(true);
    expect(isAllowedEndpoint(`http://${REMOTE}`)).toBe(false);
    expect(isAllowedEndpoint(`ftp://${REMOTE}`)).toBe(false);
    expect(isAllowedEndpoint("not a url")).toBe(false);
  });
});
