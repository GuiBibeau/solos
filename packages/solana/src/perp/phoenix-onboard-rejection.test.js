// @ts-check
import { afterEach, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { Effect, Exit } from "effect";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { traderAddress } from "./perp-onboarder-live.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import { buildFor, fakeRpc } from "./phoenix-onboard-fixture.js";
import { executeEnrollment } from "./phoenix-onboard-send.js";

/** @type {ReturnType<typeof startPhoenixFixture> | undefined} */
let fixture;
afterEach(() => fixture?.stop());

test.each([
  {
    label: "HTTP refusal",
    response: () => Response.json({ reason: "unsupported version" }, { status: 422 }),
    expected: "HTTP 422",
  },
  {
    label: "invalid response",
    response: () => Response.json({}),
    expected: "invalid registration response",
  },
])(
  "Phoenix onboarding [integration] preserves $label and the ambiguous wallet signature",
  async ({ response, expected }) => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    fixture = startPhoenixFixture({
      onboardBuild: buildFor(signer.address, await traderAddress(signer.address)),
    });
    let sends = 0;
    const config = {
      baseUrl: fixture.url,
      confirmDeadlineMs: 35,
      fetchImpl: async (url, options) => {
        if (url.endsWith("/send-register-ixs")) {
          sends += 1;
          return response();
        }
        return fetch(url, options);
      },
    };
    const ctx = {
      ...fakeRpc(),
      rpc: {
        ...fakeRpc().rpc,
        getBlockHeight: () => ({ send: async () => 1n }),
        getBalance: () => ({ send: async () => ({ value: 2_000_000_000n }) }),
        simulateTransaction: () => ({
          send: async () => ({
            value: { err: null, logs: [], accounts: [{ lamports: 1_980_000_000n }] },
          }),
        }),
        getSignatureStatuses: () => ({ send: async () => ({ value: [null] }) }),
      },
    };
    const result = await Effect.runPromiseExit(
      executeEnrollment(
        { config, ctx: /** @type {any} */ (ctx), kit: { backend: "memory", signer } },
        { type: "onboard_perp", traderPdaIndex: 0, traderSubaccountIndex: 0 },
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(sends).toBe(1);
    expect(JSON.stringify(result)).toContain(expected);
    expect(JSON.stringify(result)).toContain("may still have landed");
  },
);
