// @ts-check
/**
 * Sandbox lifecycle shared by the analyst, implementer, and reviewer sandboxes: the clone and
 * `FACTORY_SETUP_COMMAND` run once per template build, and each session pays only a fetch of the
 * current default branch. Git always targets the literal remote URL with the token injected at
 * the sandbox firewall, so the credential never enters the sandbox.
 */
import { FACTORY_REPO, FACTORY_SETUP_COMMAND } from "../constants.js";
import { describeCloneFailure, safeErrorMessage } from "./bootstrap-diagnostics.js";
import { githubCredentials } from "./credentials.js";
import { brokerPolicy, mintInstallationToken, REMOTE_URL, REPO_DIR } from "./git-remote.js";
import {
  assertNoSolanaSecrets,
  gitIdentity,
  mintTokenOrExplain,
  runOrThrow,
} from "./sandbox-commands.js";

/** @typedef {import("eve/sandbox").SandboxBootstrapContext} SandboxBootstrapContext */
/** @typedef {import("eve/sandbox").SandboxSessionContext} SandboxSessionContext */
/** @typedef {import("eve/sandbox").SandboxSession} SandboxSession */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Snapshot settings shared by every factory sandbox. One kept snapshot keeps storage flat across
 * template rebuilds; the 14-day expiration stops a quiet stretch from expiring the template and
 * queueing the next session behind a full clone-and-setup rebuild.
 * @satisfies {import("eve/sandbox/vercel").VercelSandboxCreateOptions}
 */
export const FACTORY_SANDBOX_CREATE_OPTIONS = {
  keepLastSnapshots: { count: 1, deleteEvicted: true },
  resources: { vcpus: 4 },
  snapshotExpiration: 14 * DAY_MS,
};

/**
 * Build-time revalidation key: changing the target repository or its setup command rebuilds the
 * template (authored sandbox source is tracked by eve automatically).
 */
export const factoryRevalidationKey = () =>
  `factory-repo-v2:${FACTORY_REPO}:${FACTORY_SETUP_COMMAND}`;

/**
 * Clone the repository through the brokered firewall, translating a failure into a message that
 * names `FACTORY_REPO` and the fix. Idempotent: a template whose earlier bootstrap failed keeps its
 * half-finished clone, so any leftover checkout is removed first.
 * @param {SandboxSession} sandbox
 */
const cloneOrExplain = async (sandbox) => {
  try {
    await runOrThrow(
      sandbox,
      `rm -rf ${REPO_DIR} && mkdir -p ${REPO_DIR} && git clone --depth 50 ${REMOTE_URL} ${REPO_DIR}`,
    );
  } catch (error) {
    throw new Error(describeCloneFailure(FACTORY_REPO, safeErrorMessage(error)), { cause: error });
  }
};

/**
 * Template-scoped bootstrap: clone the factory repository and run its setup command. A failure
 * fails the template build, not a session. The git identity is deliberately not set here: config
 * written at build lands in the builder's home, not the session user's.
 * @param {SandboxBootstrapContext} input
 */
export const factoryBootstrap = async ({ use }) => {
  const sandbox = await use();
  await assertNoSolanaSecrets(sandbox);
  const token = await mintTokenOrExplain(() => mintInstallationToken(githubCredentials));
  await sandbox.setNetworkPolicy(brokerPolicy(token));
  try {
    await cloneOrExplain(sandbox);
    await runOrThrow(sandbox, `cd ${REPO_DIR} && ${FACTORY_SETUP_COMMAND}`);
  } finally {
    await sandbox.setNetworkPolicy("allow-all");
  }
};

/** Bun lives outside any home directory so the session user finds the build-time install. */
export const BUN_BIN = "/workspace/.bun/bin";

/**
 * Session-scoped setup: fix git's ownership check (the template snapshot is owned by the builder
 * uid), write the commit identity where the session user reads it, move the checkout to the
 * repository's current default branch (read from `origin/HEAD` rather than assumed), and
 * reinstall from that revision's lockfile so a dependency change merged after the template build
 * never leaves a station verifying against stale packages. Bun's cache makes this a no-op when
 * nothing changed.
 * @param {SandboxSessionContext} input
 */
export const factoryOnSession = async ({ use }) => {
  const sandbox = await use();
  await assertNoSolanaSecrets(sandbox);
  await runOrThrow(
    sandbox,
    `test -d ${REPO_DIR}/.git || { echo 'factory checkout missing at ${REPO_DIR}: the sandbox template predates the repository clone; redeploy the factory to rebuild templates' >&2; exit 1; }`,
  );
  const identity = await gitIdentity();
  await runOrThrow(
    sandbox,
    `git config --global --add safe.directory /workspace && git config --global --add safe.directory /workspace/repo && git config --global user.name "${identity.name}" && git config --global user.email "${identity.email}"`,
  );
  const token = await mintTokenOrExplain(() => mintInstallationToken(githubCredentials));
  await sandbox.setNetworkPolicy(brokerPolicy(token));
  try {
    await runOrThrow(
      sandbox,
      `cd ${REPO_DIR} && branch=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||') && git fetch ${REMOTE_URL} "$branch" && git checkout -B "$branch" FETCH_HEAD`,
    );
  } finally {
    await sandbox.setNetworkPolicy("allow-all");
  }
  await runOrThrow(
    sandbox,
    `cd ${REPO_DIR} && export PATH="${BUN_BIN}:$PATH" && bun install --frozen-lockfile`,
  );
};
