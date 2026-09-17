// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { githubChannel } from "eve/channels/github";
import { rebaseSchedule } from "../../schedules/rebase-pull-requests.js";
import { APP_AUTH, rebaseFixture, withRebaseApi } from "./rebase-fixture.js";

/** @type {Set<ReturnType<typeof Bun.serve>>} */
const servers = new Set();
afterEach(async () => {
  for (const server of servers) await server.stop(true);
  servers.clear();
});

/** Real Eve receive hook: a private repository's anonymous discovery endpoint returns 404. */
const privateChannel = () => {
  const calls = /** @type {string[]} */ ([]);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      calls.push(request.url);
      return Response.json({ message: "Not Found" }, { status: 404 });
    },
  });
  servers.add(server);
  const channel = githubChannel({
    botName: "solos-factory",
    credentials: { installationToken: "offline-token" },
    api: { apiBaseUrl: server.url.origin },
  });
  return { calls, channel };
};

const unexpected = () => {
  throw new Error("Unexpected Eve operation");
};
const receiver = () => {
  const received = /** @type {unknown[]} */ ([]);
  /** @type {Parameters<NonNullable<ReturnType<typeof privateChannel>["channel"]["receive"]>>[1]} */
  const context = {
    from: () => ({
      send: async (_message, options) => {
        received.push(options);
        return /** @type {import("eve/channels").Session} */ ({ id: "offline-session" });
      },
      respond: unexpected,
      cancel: unexpected,
      compact: unexpected,
      clear: unexpected,
      reset: unexpected,
    }),
  };
  return { received, context };
};

describe("[integration] private-repository rebase handoff", () => {
  test("the scheduled target reaches Eve without an anonymous repository lookup", async () => {
    const { calls, channel } = privateChannel();
    const { received, context } = receiver();
    await withRebaseApi(rebaseFixture(), async (api) => {
      const schedule = rebaseSchedule({ api, botName: async () => "solos-factory" });
      const pending = /** @type {Promise<unknown>[]} */ ([]);
      await schedule.run({
        appAuth: APP_AUTH,
        waitUntil: (promise) => {
          pending.push(promise);
        },
        to: (_definition, target) => ({
          send: async (message, options) => {
            if (!channel.receive) throw new Error("Missing GitHub receive hook");
            return channel.receive({ target, message, auth: options.auth }, context);
          },
        }),
      });
      await Promise.all(pending);
    });
    expect(calls).toHaveLength(0);
    expect(received).toMatchObject([{ state: { repositoryId: 123, pullRequestNumber: 37 } }]);
  });

  test("a target lacking the repository ID reproduces Eve's private-repo 404", async () => {
    const { calls, channel } = privateChannel();
    const { context } = receiver();
    if (!channel.receive) throw new Error("Missing GitHub receive hook");
    await expect(
      channel.receive(
        {
          target: { owner: "GuiBibeau", repo: "solos", pullRequestNumber: 37 },
          message: "offline test",
          auth: APP_AUTH,
        },
        context,
      ),
    ).rejects.toThrow("HTTP 404");
    expect(calls).toHaveLength(1);
  });
});
