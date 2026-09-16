import { describe, expect, test } from "bun:test";
import { privyApi } from "./api.js";

const config = { appId: "app", authBaseUrl: "https://auth.test", agentUrl: "https://agents.test" };

describe("privy device flow client", () => {
  test("device authorization sends app id and agent origin, no secret", async () => {
    let seen;
    const api = privyApi(config, async (url, init) => {
      seen = { url, headers: init.headers, body: init.body };
      return Response.json({
        device_code: "d",
        user_code: "ABCD-1234",
        verification_uri: "u",
        verification_uri_complete: "u?c",
        expires_in: 600,
        interval: 5,
      });
    });
    const result = await api.startDeviceAuthorization();
    expect(result.user_code).toBe("ABCD-1234");
    expect(seen.url).toBe("https://auth.test/api/oauth/v2/device_authorization");
    expect(seen.headers["privy-app-id"]).toBe("app");
    expect(seen.headers.Origin).toBe("https://agents.test");
    expect(Object.keys(seen.headers).some((h) => /secret|authorization/i.test(h))).toBe(false);
  });

  test("polling maps RFC 8628 errors and returns tokens on success", async () => {
    const answers = [
      { status: 400, body: { error: "authorization_pending" } },
      { status: 400, body: { error: "slow_down" } },
      {
        status: 200,
        body: { access_token: "a", token_type: "Bearer", expires_in: 900, refresh_token: "r" },
      },
    ];
    const api = privyApi(config, async () => {
      const next = answers.shift();
      return Response.json(next.body, { status: next.status });
    });
    expect(await api.pollDeviceToken("d")).toBe("pending");
    expect(await api.pollDeviceToken("d")).toBe("slow_down");
    expect((await api.pollDeviceToken("d")).access_token).toBe("a");
  });

  test("expired and denied codes are errors that name the cause", async () => {
    const api = privyApi(config, async () =>
      Response.json({ error: "access_denied" }, { status: 400 }),
    );
    await expect(api.pollDeviceToken("d")).rejects.toThrow(/denied/);
  });
});
