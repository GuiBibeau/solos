// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { pinnedFetch } from "./pinned-fetch.js";

/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** A loopback provider that answers by script and records every request it saw. */
const provider = (/** @type {(url: URL, request: Request) => Response} */ answer) => {
  /** @type {Array<{ path: string; key: string | null }>} */
  const seen = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      seen.push({ path: url.pathname, key: request.headers.get("x-key") });
      return answer(url, request);
    },
  });
  stops.push(() => server.stop(true));
  return { seen, origin: `http://127.0.0.1:${server.port}` };
};

const request = () => ({
  label: "Test",
  headers: { "x-key": "secret" },
  signal: AbortSignal.timeout(5000),
});

describe("pinnedFetch [integration]", () => {
  test("follows a same-origin redirect and keeps the credential on every hop", async () => {
    const p = provider((url) =>
      url.pathname === "/start"
        ? new Response(null, { status: 302, headers: { location: "/final" } })
        : Response.json({ ok: 1 }),
    );
    const outcome = await pinnedFetch(request(), new URL("/start", p.origin));
    expect(outcome.status).toBe(200);
    expect(JSON.parse(outcome.body)).toEqual({ ok: 1 });
    expect(p.seen.map((s) => [s.path, s.key])).toEqual([
      ["/start", "secret"],
      ["/final", "secret"],
    ]);
  });

  test("refuses a cross-origin redirect before the other host sees anything", async () => {
    const other = provider(() => Response.json({ leaked: true }));
    const p = provider(
      () => new Response(null, { status: 302, headers: { location: `${other.origin}/steal` } }),
    );
    await expect(pinnedFetch(request(), new URL("/start", p.origin))).rejects.toThrow(
      "Test redirect crossed origins",
    );
    expect(other.seen).toHaveLength(0);
  });

  test("refuses to follow a redirected POST", async () => {
    const p = provider(() => new Response(null, { status: 307, headers: { location: "/again" } }));
    await expect(
      pinnedFetch({ ...request(), method: "POST", body: "{}" }, new URL("/chat", p.origin)),
    ).rejects.toThrow("Test redirected a POST; refused");
    expect(p.seen).toHaveLength(1);
  });

  test("stops reading a body past the byte cap", async () => {
    const p = provider(() => new Response("x".repeat(2048)));
    await expect(
      pinnedFetch({ ...request(), maxBytes: 1024 }, new URL("/big", p.origin)),
    ).rejects.toThrow("Test response exceeded the size limit");
  });

  test("gives up after the hop limit", async () => {
    const p = provider(() => new Response(null, { status: 302, headers: { location: "/loop" } }));
    await expect(pinnedFetch(request(), new URL("/loop", p.origin))).rejects.toThrow(
      "Test exceeded the redirect hop limit",
    );
  });
});
