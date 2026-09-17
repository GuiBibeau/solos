// @ts-check
import { FACTORY_REPO } from "../constants.js";
import { stampAutonomous } from "../trust.js";
import { rebaseApi } from "./rebase-api.js";

export const OLD_HEAD = "a".repeat(40);
export const MAIN_SHA = "b".repeat(40);
export const NEW_HEAD = "c".repeat(40);
export const BOT = { type: "Bot", login: "solos-factory[bot]" };
/** @type {import("eve/context").SessionAuthContext} */
export const APP_AUTH = {
  authenticator: "app",
  principalId: "eve:app",
  principalType: "runtime",
  attributes: {},
};
export const REBASE_AUTH = stampAutonomous(APP_AUTH, 37);
export const REBASE_INPUT = { pullNumber: 37, expectedHead: OLD_HEAD, expectedBase: MAIN_SHA };

export const rebaseFixture = () => ({
  pr: {
    number: 37,
    node_id: "PR_test37",
    state: "open",
    head: { ref: "factory/test", sha: OLD_HEAD, repo: { id: 123, full_name: FACTORY_REPO } },
    base: { ref: "main", sha: MAIN_SHA, repo: { id: 123, full_name: FACTORY_REPO } },
  },
  comments: /** @type {{user: typeof BOT, body: string}[]} */ ([]),
  calls: /** @type {{path: string, method: string, body: unknown}[]} */ ([]),
  main: MAIN_SHA,
  behind: true,
  conflict: false,
  race: false,
  failApi: false,
  pulls: /** @type {unknown[] | null} */ (null),
  compareCount: 0,
});

/** @typedef {ReturnType<typeof rebaseFixture>} Fixture */
/** @param {Fixture} fixture @param {Record<string, unknown>} body */
const mutate = (fixture, body) => {
  if (fixture.race) fixture.pr.head.sha = "d".repeat(40);
  const variables = /** @type {{input: {expectedHeadOid: string, updateMethod: string}}} */ (
    body.variables
  );
  if (fixture.conflict || variables.input.expectedHeadOid !== fixture.pr.head.sha)
    return Response.json({ errors: [{ message: "conflict or unexpected head" }] });
  fixture.pr.head.sha = NEW_HEAD;
  fixture.behind = false;
  return Response.json({
    data: { updatePullRequestBranch: { pullRequest: { headRefOid: NEW_HEAD } } },
  });
};

/** @param {Fixture} fixture @param {Request} request */
const respond = async (fixture, request) => {
  const { pathname, searchParams } = new URL(request.url);
  const body = request.method === "GET" ? undefined : await request.json();
  fixture.calls.push({ path: pathname, method: request.method, body });
  if (request.headers.get("authorization") !== "Bearer offline-token")
    return new Response(null, { status: 401 });
  if (fixture.failApi) return new Response(null, { status: 503 });
  if (pathname === "/graphql") return mutate(fixture, body);
  if (pathname.includes("/compare/")) {
    fixture.compareCount++;
    return Response.json({ behind_by: fixture.behind ? 1 : 0 });
  }
  return readResponse(fixture, { pathname, searchParams, body });
};

/** @param {Fixture} fixture @param {{pathname: string, searchParams: URLSearchParams, body: {body: string} | undefined}} input */
const readResponse = (fixture, { pathname, searchParams, body }) => {
  if (pathname.endsWith("/git/ref/heads/main"))
    return Response.json({ object: { sha: fixture.main } });
  const start = (Number(searchParams.get("page") ?? 1) - 1) * 100;
  if (pathname.endsWith("/pulls"))
    return Response.json((fixture.pulls ?? [fixture.pr]).slice(start, start + 100));
  if (pathname.endsWith("/pulls/37")) return Response.json(fixture.pr);
  if (pathname.endsWith("/issues/37/comments")) return commentsResponse(fixture, { start, body });
  return new Response(null, { status: 404 });
};

/** @param {Fixture} fixture @param {{start: number, body: {body: string} | undefined}} input */
const commentsResponse = (fixture, { start, body }) => {
  if (body) {
    fixture.comments.push({ user: BOT, body: body.body });
    return Response.json({ id: fixture.comments.length });
  }
  return Response.json(fixture.comments.slice(start, start + 100));
};

/** @template T @param {Fixture} fixture
 * @param {(api: ReturnType<typeof rebaseApi>) => Promise<T>} run
 */
export const withRebaseApi = async (fixture, run) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => respond(fixture, request),
  });
  try {
    return await run(rebaseApi({ baseUrl: server.url.origin, token: async () => "offline-token" }));
  } finally {
    await server.stop(true);
  }
};
