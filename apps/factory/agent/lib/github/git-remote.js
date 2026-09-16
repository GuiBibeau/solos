// @ts-check
/**
 * Git safety is structural. Every clone, fetch, and push targets {@link REMOTE_URL} literally
 * (remote config inside a sandbox is model-writable), everything interpolated into a git command
 * passes {@link validateBranch}, and the installation token is injected at the sandbox firewall.
 */
import { FACTORY_REPO } from "../constants.js";

/** @typedef {import("eve/channels/github").GitHubChannelCredentials} GitHubChannelCredentials */
/** @typedef {import("eve/sandbox").SandboxNetworkPolicy} SandboxNetworkPolicy */

const PROTECTED_BRANCHES = new Set(["main", "master"]);

/**
 * Conservative subset of valid git branch names: alphanumeric segments separated by `.`, `_`, `-`
 * or `/`, so shell metacharacters can never reach the command line.
 */
const BRANCH_PATTERN = /^[A-Za-z\d](?:[\w./-]*[A-Za-z\d])?$/;

/** `..` and `//` are legal to the pattern above but not to git. */
const DOUBLE_SEPARATOR = /\.\.|\/\//;

/** Where the station sandboxes keep the factory repository checkout. */
export const REPO_DIR = "/workspace/repo";

/** The URL every clone, fetch, and push targets, literally, never through `origin`. */
export const REMOTE_URL = `https://github.com/${FACTORY_REPO}.git`;

/**
 * The refusal reason, or null when the branch name may be used in a git command. Protected
 * branches are refused outright: the factory delivers pull requests, never direct pushes.
 * @param {string} branch
 * @returns {string | null}
 */
export const validateBranch = (branch) => {
  const isWellFormed = BRANCH_PATTERN.test(branch) && !DOUBLE_SEPARATOR.test(branch);
  if (!isWellFormed) return `"${branch}" is not a valid branch name.`;
  if (branch === "HEAD" || branch.startsWith("refs/")) {
    return `"${branch}" is not a plain branch name. Pass the branch name without a refs/ prefix.`;
  }
  if (PROTECTED_BRANCHES.has(branch)) {
    return `Direct pushes to ${branch} are not allowed. Push a feature branch and open a pull request.`;
  }
  return null;
};

/**
 * Firewall policy that brokers the installation token onto egress to github.com only. The token
 * never enters the sandbox process; `"*": []` keeps general egress open so installs and tests
 * keep working while the policy is active.
 * @param {string} installationToken
 * @returns {SandboxNetworkPolicy}
 */
export const brokerPolicy = (installationToken) => {
  const authorization = `Basic ${Buffer.from(`x-access-token:${installationToken}`).toString("base64")}`;
  return {
    allow: {
      "*": [],
      "github.com": [{ transform: [{ headers: { Authorization: authorization } }] }],
    },
  };
};

/**
 * The Connect-managed installation token, minted when it is lazy.
 * @param {GitHubChannelCredentials} credentials
 * @returns {Promise<string>}
 */
export const mintInstallationToken = async (credentials) => {
  const token = credentials.installationToken;
  if (token === undefined) throw new Error("The GitHub connector exposes no installation token.");
  return typeof token === "function" ? await token() : token;
};
