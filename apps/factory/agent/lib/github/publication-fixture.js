// @ts-check
import { FACTORY_REPO } from "../constants.js";

export const TARGET_SHA = "a".repeat(40);
export const OTHER_SHA = "b".repeat(40);
export const START = "2026-09-20T10:00:00.000Z";

/** @param {string} [sha] */
export const fullEvidence = (sha = TARGET_SHA) =>
  JSON.stringify({
    ok: true,
    sha,
    dirty: false,
    scope: "full",
    versions: { bun: "1.3.14", surfpool: "surfpool 1.5.0" },
    steps: [
      "line-limit",
      "format",
      "lint",
      "depcruise",
      "typecheck",
      "test:unit",
      "test:integration",
    ].map((name) => ({ name, command: `run ${name}`, ok: true, ms: 1, summary: "ok" })),
    startedAt: START,
    durationMs: 7,
  });

export const publicationAuth = /** @type {import("eve/context").SessionAuthContext} */ ({
  authenticator: "github",
  principalId: "github:1",
  principalType: "user",
  attributes: { trusted: "true" },
});

/** @param {{body?: string, head?: string, now?: string, updatedAt?: string,
 * check?: Record<string, unknown> | null}} [input] */
export const publicationFixture = (input = {}) => {
  const state = newFixtureState(input);
  const api = fixtureApi(state);
  return {
    state,
    api,
    context: {
      api,
      botName: "solos-factory",
      auth: publicationAuth,
      now: () => new Date(state.now),
    },
  };
};

/** @param {{body?: string, head?: string, now?: string, updatedAt?: string,
 * check?: Record<string, unknown> | null}} input */
const newFixtureState = (input) => ({
  body: input.body ?? "Intro\n\n## Notes\n\nHuman note.\n",
  head: input.head ?? TARGET_SHA,
  now: input.now ?? "2026-09-20T10:01:00.000Z",
  updatedAt: input.updatedAt ?? START,
  comments: /** @type {Record<string, unknown>[]} */ ([]),
  timeline: /** @type {Record<string, unknown>[]} */ ([
    { event: "synchronize", after_commit_id: input.head ?? TARGET_SHA, created_at: START },
  ]),
  events: /** @type {Record<string, unknown>[]} */ ([
    {
      type: "PushEvent",
      created_at: START,
      payload: { ref: "refs/heads/factory/test", head: input.head ?? TARGET_SHA },
    },
  ]),
  check: fixtureCheck(input),
  bodyWrites: 0,
  nextCommentId: 10,
});

/** @param {{check?: Record<string, unknown> | null, now?: string}} input */
const fixtureCheck = (input) =>
  input.check === undefined
    ? { name: "evidence", status: "queued", conclusion: null, started_at: input.now ?? START }
    : input.check;

/** @typedef {ReturnType<typeof newFixtureState>} FixtureState */
/** @param {FixtureState} state */
const fixtureApi = (state) => {
  /** @type {import("./rebase-api.js").RebaseApi} */
  const api = async (path, init = {}) => {
    const read = readFixture(state, path);
    if (read !== undefined && init.method === undefined) return read;
    const written = writeFixture(state, path, init);
    if (written !== undefined) return written;
    throw new Error(`Unexpected fixture API ${init.method ?? "GET"} ${path}`);
  };
  return api;
};

/** @param {FixtureState} state @param {string} path */
const readFixture = (state, path) => {
  const clean = path.replace(/([?&])page=\d+/u, "$1page=x");
  if (path === `/repos/${FACTORY_REPO}/pulls/37`) return pull(state);
  if (clean.startsWith(`/repos/${FACTORY_REPO}/issues/37/comments?`)) return state.comments;
  if (clean.startsWith(`/repos/${FACTORY_REPO}/issues/37/timeline?`)) return state.timeline;
  if (clean.startsWith(`/repos/${FACTORY_REPO}/events?`)) return state.events;
  if (path.includes(`/commits/${state.head}/check-runs`))
    return { check_runs: state.check ? [state.check] : [] };
  return undefined;
};

/** @param {FixtureState} state @param {string} path
 * @param {{method?: string, body?: unknown}} init
 */
const writeFixture = (state, path, init) => {
  if (path === `/repos/${FACTORY_REPO}/pulls/37` && init.method === "PATCH") {
    state.body = String(/** @type {Record<string, unknown>} */ (init.body).body);
    state.bodyWrites += 1;
    state.updatedAt = new Date(Date.parse(state.now) + state.bodyWrites).toISOString();
    return pull(state);
  }
  if (path === `/repos/${FACTORY_REPO}/issues/37/comments` && init.method === "POST")
    return createFixtureComment(state, init.body);
  const match = /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/u.exec(path);
  if (!match || init.method !== "PATCH") return undefined;
  const comment = state.comments.find((item) => item.id === Number(match[1]));
  if (!comment) throw new Error("Missing fixture comment");
  comment.body = String(/** @type {Record<string, unknown>} */ (init.body).body);
  return comment;
};

/** @param {FixtureState} state @param {unknown} body */
const createFixtureComment = (state, body) => {
  const comment = {
    id: state.nextCommentId++,
    body: String(/** @type {Record<string, unknown>} */ (body).body),
    user: { login: "solos-factory[bot]", type: "Bot" },
  };
  state.comments.push(comment);
  return comment;
};

/** @param {{body: string, head: string, updatedAt: string}} state */
const pull = (state) => ({
  number: 37,
  state: "open",
  body: state.body,
  updated_at: state.updatedAt,
  head: { sha: state.head, ref: "factory/test" },
});
