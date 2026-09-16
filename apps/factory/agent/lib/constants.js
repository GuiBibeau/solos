// @ts-check
/**
 * Deployment-level settings, every one read from the environment with a solOS default.
 *
 * Nothing here touches Solana: the factory holds no signer, RPC URL, profile, or gateway key,
 * and none of the `SOLOS_*` / `SOLANA_*` variables are read anywhere in this app.
 */

/**
 * Read an environment variable, falling back when it is unset or empty.
 * @param {string} name
 * @param {string} fallback
 */
export const envOr = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

/**
 * The repository the factory works on, as `owner/repo`. Every surface reads this one constant:
 * the GitHub extension's default context, the station sandboxes' clone, and the push URL.
 */
export const FACTORY_REPO = envOr("FACTORY_REPO", "GuiBibeau/solos");

// GitHub's own naming rules: owner is alphanumeric with inner hyphens, repo adds dots and
// underscores. A malformed value fails discovery here instead of a cryptic clone error later.
const FACTORY_REPO_PATTERN = /^[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?\/[\w.-]+$/;

if (!FACTORY_REPO_PATTERN.test(FACTORY_REPO)) {
  throw new Error(
    `FACTORY_REPO must reference a GitHub repository in owner/repo format (e.g. 'GuiBibeau/solos'), got '${FACTORY_REPO}'.`,
  );
}

const [factoryOwner = "", factoryRepoName = ""] = FACTORY_REPO.split("/", 2);

/** {@link FACTORY_REPO} split into the `owner` / `repo` fields GitHub tools take. */
export const factoryRepo = Object.freeze({ owner: factoryOwner, repo: factoryRepoName });

/**
 * The issue label that hands an issue to the factory. Applying it requires triage permission on
 * the repository, so the trigger is maintainer-initiated even though the run is unattended.
 */
export const FACTORY_LABEL = envOr("FACTORY_LABEL", "agent-ready");

/**
 * Branch-name prefix for the factory's own feature branches (`factory/<type>-<slug>`). The GitHub
 * channel uses it to recognise the factory's own pull requests, so the red-CI fix loop never runs
 * on branches people pushed.
 */
export const FACTORY_BRANCH_PREFIX = envOr("FACTORY_BRANCH_PREFIX", "factory/");

/**
 * Runs once inside the station sandboxes' clone at template build: installs Bun at the pinned
 * version, installs dependencies with the frozen lockfile, and runs the `check` scope of the
 * verification lever so every session starts from a green tree.
 */
export const FACTORY_SETUP_COMMAND = envOr(
  "FACTORY_SETUP_COMMAND",
  "bash scripts/factory-setup.sh",
);
