// @ts-check
import { describe, expect, test } from "bun:test";
import { installRedaction } from "./redact.js";

const TOKEN = "super-secret-engine-token";
const RPC = "https://user:pass@rpc.example/secret-path?q=secret-query";

describe("engine stderr redaction", () => {
  test("a log line loses the token, the userinfo, the path and the query", () => {
    /** @type {string[]} */
    const chunks = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, encoding, callback) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return original(chunk, encoding, callback);
    };
    const restore = installRedaction({ token: TOKEN, rpcUrl: RPC });
    console.error(`bearer ${TOKEN} via ${RPC}`);
    restore();
    process.stderr.write = original;
    const text = chunks.join("");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("secret-path");
    expect(text).not.toContain("secret-query");
    expect(text).not.toContain("pass");
    expect(text).toContain("[redacted]");
  });
});
