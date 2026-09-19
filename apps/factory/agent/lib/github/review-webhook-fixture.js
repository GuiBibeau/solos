// @ts-check
/** Offline GitHub API fixture for the signed-webhook integration tests. */
import { createGitHubChannel, githubConfig } from "../../channels/github.js";
import { FACTORY_REPO } from "../constants.js";
import { invokeWebhook, WEBHOOK_SECRET } from "./webhook-route-fixture.js";

export const REVIEW_SHA = "a".repeat(40);
export const CODEX_USER = { id: 199_175_422, login: "chatgpt-codex-connector[bot]", type: "Bot" };

const REPOSITORY = {
  id: 123,
  full_name: FACTORY_REPO,
  name: "solos",
  owner: { login: "GuiBibeau" },
  private: false,
};
const REVIEW = {
  id: 700,
  user: CODEX_USER,
  commit_id: REVIEW_SHA,
  submitted_at: "2026-09-17",
  state: "COMMENTED",
};
const FIRST_COMMENT = {
  id: 100,
  user: CODEX_USER,
  body: "[P1] First finding",
  commit_id: REVIEW_SHA,
  pull_request_review_id: 700,
  in_reply_to_id: /** @type {number | null} */ (null),
  author_association: "NONE",
  path: "example.js",
  line: 10,
};

export const reviewFixture = () => {
  const repo = structuredClone(REPOSITORY);
  const pr = {
    number: 37,
    state: "open",
    title: "Test PR",
    head: { sha: REVIEW_SHA, ref: "factory/test", repo },
    base: { ref: "main", repo },
  };
  const review = structuredClone(REVIEW);
  const first = structuredClone(FIRST_COMMENT);
  const second = { ...first, id: 101, body: "[P2] Second finding" };
  return {
    payload: {
      action: "created",
      repository: repo,
      sender: CODEX_USER,
      installation: { id: 1 },
      pull_request: pr,
      issue: {
        number: 37,
        pull_request: { url: "https://api.github.com/repos/GuiBibeau/solos/pulls/37" },
      },
      comment: first,
    },
    pr,
    review,
    comments: [second, first],
    history: /** @type {{user: typeof CODEX_USER, body: string}[]} */ ([]),
    requests: /** @type {string[]} */ ([]),
    failApi: false,
  };
};

/** @typedef {ReturnType<typeof reviewFixture>} Fixture */
/** @param {Fixture} fixture @param {Request} request */
const apiResponse = (fixture, request) => {
  const { pathname, searchParams } = new URL(request.url);
  fixture.requests.push(pathname);
  if (fixture.failApi) return new Response("unavailable", { status: 503 });
  if (/\/reviews\/\d+\/comments$/u.test(pathname)) {
    const start = (Number(searchParams.get("page") ?? 1) - 1) * 100;
    return Response.json(fixture.comments.slice(start, start + 100));
  }
  if (/\/reviews\/\d+$/u.test(pathname)) return Response.json(fixture.review);
  if (pathname.endsWith("/issues/37/comments")) return Response.json(fixture.history);
  if (pathname.endsWith("/pulls/37")) return Response.json(fixture.pr);
  if (pathname.endsWith("/pulls/37/files")) return Response.json([]);
  throw new Error(`Unexpected GitHub request: ${pathname}`);
};

/** @param {Fixture} fixture @param {{event?: string, validSignature?: boolean, defaultHandler?: boolean}} [options] */
export const deliverReview = async (fixture, options = {}) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => apiResponse(fixture, request),
  });
  try {
    const channel = createGitHubChannel({
      ...githubConfig,
      onComment: options.defaultHandler ? undefined : githubConfig.onComment,
      botName: "solos-factory",
      credentials: { webhookSecret: WEBHOOK_SECRET, installationToken: "offline-test-token" },
      api: { apiBaseUrl: server.url.origin },
    });
    return await invokeWebhook(channel, fixture.payload, options);
  } finally {
    await server.stop(true);
  }
};
