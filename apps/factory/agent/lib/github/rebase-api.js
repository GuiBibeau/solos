// @ts-check
import { FACTORY_BRANCH_PREFIX, FACTORY_REPO } from "../constants.js";
import { asRecord, stringField } from "./channel-gates.js";
import { githubCredentials } from "./credentials.js";
import { mintInstallationToken } from "./git-remote.js";

/** Runtime-only HTTP client; credentials never enter model input or a sandbox.
 * @param {{baseUrl?: string, token?: () => Promise<string>}} [options]
 */
export const rebaseApi = (options = {}) => {
  const baseUrl = options.baseUrl ?? "https://api.github.com";
  const token = options.token ?? (() => mintInstallationToken(githubCredentials));
  /** @param {string} path @param {{method?: string, body?: unknown}} [init] */
  return async (path, init = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${await token()}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub rebase API returned HTTP ${response.status}`);
    return /** @type {unknown} */ (await response.json());
  };
};

/** @typedef {ReturnType<typeof rebaseApi>} RebaseApi */
export const REPO_PATH = `/repos/${FACTORY_REPO}`;

/** @param {RebaseApi} api @param {string} path @returns {Promise<unknown[]>} */
export const rebaseList = async (api, path) => {
  const entries = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= 10; page++) {
    const body = await api(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(body)) throw new Error("Expected a GitHub list");
    entries.push(...body);
    if (body.length < 100) return entries;
  }
  throw new Error("GitHub list exceeds automatic rebase limit");
};

/** Only same-repository factory PRs targeting main may be rewritten.
 * @param {unknown} value
 */
export const rebaseCandidate = (value) => {
  const pr = asRecord(value);
  if (!pr || pr.state !== "open") return null;
  const head = asRecord(pr.head);
  const base = asRecord(pr.base);
  if (!head || !base || !areFactoryRefs(head, base)) return null;
  const branch = stringField(head, "ref");
  if (!branch?.startsWith(FACTORY_BRANCH_PREFIX)) return null;
  return parseCandidate(pr, { branch, head, base });
};

/** @param {Record<string, unknown>} head @param {Record<string, unknown>} base */
const areFactoryRefs = (head, base) =>
  base.ref === "main" &&
  stringField(head.repo, "full_name") === FACTORY_REPO &&
  stringField(base.repo, "full_name") === FACTORY_REPO;

/** @param {Record<string, unknown>} pr
 * @param {{branch: string, head: Record<string, unknown> | null, base: Record<string, unknown>}} refs
 */
const parseCandidate = (pr, refs) => {
  const head = stringField(refs.head, "sha");
  const base = stringField(refs.base, "sha");
  const id = stringField(pr, "node_id");
  if (!(head && base && id && typeof pr.number === "number")) return null;
  if (!/^[a-f\d]{40}$/u.test(head) || !/^[a-f\d]{40}$/u.test(base)) return null;
  return { pullNumber: pr.number, id, branch: refs.branch, head, base };
};

/** @typedef {NonNullable<ReturnType<typeof rebaseCandidate>>} RebaseCandidate */
/** @param {RebaseApi} api @param {RebaseCandidate} pr */
export const behindMain = async (api, pr) => {
  const result = asRecord(await api(`${REPO_PATH}/compare/${pr.base}...${pr.head}?per_page=1`));
  if (typeof result?.behind_by !== "number") throw new Error("Missing GitHub comparison");
  return result.behind_by > 0;
};
