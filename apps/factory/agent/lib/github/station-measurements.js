// @ts-check
import { REPO_DIR } from "./git-remote.js";
import { BUN_BIN, SURFPOOL_BIN } from "./repo-sandbox.js";

/** @typedef {import("eve/sandbox").SandboxSession} SandboxSession */
/** @typedef {"check" | "unit" | "full"} Scope */
/** @typedef {{branch?: string, expectedHead?: string, expectedRemoteHead?: string, scope: Scope}} VerificationInput */

const PATH_PREFIX = `export PATH="${BUN_BIN}:${SURFPOOL_BIN}:$PATH"`;
const SURFPOOL_VERSION_COMMAND = String.raw`sed -nE 's/^[[:space:]]*SURFPOOL_VERSION: "([^"]+)".*/\1/p' .github/workflows/ci.yml | head -1`;
/** @param {unknown} value */
const clean = (value) => String(value ?? "").trim();

/** @param {SandboxSession} sandbox @param {string} value */
export const command = async (sandbox, value) => {
  const result = await sandbox.run({ command: `cd ${REPO_DIR} && ${PATH_PREFIX} && ${value}` });
  return {
    code: result.exitCode,
    stderr: clean(result.stderr),
    stdout: String(result.stdout ?? ""),
  };
};

/** @param {SandboxSession} sandbox @param {string} value */
const read = async (sandbox, value) => {
  const result = await command(sandbox, value);
  return result.code === 0 ? clean(result.stdout) : null;
};

/** @param {SandboxSession} sandbox */
const smokeOffline = async (sandbox) => {
  const up = await command(
    sandbox,
    "unset SURFNET_DATASOURCE_RPC_URL SOLANA_RPC_URL; bun run solos dev surfpool up --port 18899",
  );
  await command(sandbox, "bun run solos dev surfpool down");
  if (up.code !== 0) return false;
  try {
    return JSON.parse(up.stdout).offline === true;
  } catch {
    return false;
  }
};

/** @param {SandboxSession} sandbox */
const measureCheckout = async (sandbox) => {
  const [actualHead, branch, status, platform, architecture] = await Promise.all([
    read(sandbox, "git rev-parse HEAD"),
    read(sandbox, "git branch --show-current"),
    read(sandbox, "git status --porcelain"),
    read(sandbox, "uname -s"),
    read(sandbox, "uname -m"),
  ]);
  return { actualHead, architecture, branch, platform, status };
};

/** @param {SandboxSession} sandbox */
const measureRuntime = async (sandbox) => {
  const [bunPath, bunVersion, requiredBunVersion, requiredSurfpoolVersion, surfpoolPath] =
    await Promise.all([
      read(sandbox, "command -v bun"),
      read(sandbox, "bun --version"),
      read(sandbox, "tr -d '[:space:]' < .bun-version"),
      read(sandbox, SURFPOOL_VERSION_COMMAND),
      read(sandbox, "command -v surfpool"),
    ]);
  const surfpoolVersion = surfpoolPath ? await read(sandbox, "surfpool --version") : null;
  return {
    bunPath,
    bunVersion,
    requiredBunVersion,
    requiredSurfpoolVersion,
    surfpoolPath,
    surfpoolVersion,
  };
};

/** @param {VerificationInput} input */
const hasVerificationContract = (input) =>
  input.expectedHead !== undefined &&
  (input.branch === undefined) === (input.expectedRemoteHead === undefined);

/** @param {{actualHead: string|null, branch: string|null}} checkout @param {VerificationInput} input @param {string|null|undefined} observedRemote */
const hasMatchingRevision = (checkout, input, observedRemote) =>
  (!input.expectedHead || checkout.actualHead === input.expectedHead) &&
  (!input.branch || checkout.branch === input.branch) &&
  (!input.branch || observedRemote === input.expectedRemoteHead);

/** @param {{actualHead: string|null, branch: string|null, status: string|null}} checkout @param {VerificationInput} input @param {string|null|undefined} observedRemote */
const canPrepare = (checkout, input, observedRemote) =>
  hasVerificationContract(input) &&
  checkout.status === "" &&
  hasMatchingRevision(checkout, input, observedRemote);

/** @param {SandboxSession} sandbox @param {boolean} shouldPrepare @param {boolean} shouldSmoke */
const prepareRuntime = async (sandbox, shouldPrepare, shouldSmoke) => {
  const install = shouldPrepare
    ? await command(sandbox, "bun install --frozen-lockfile")
    : { code: 1 };
  const canSmoke = shouldPrepare && shouldSmoke && install.code === 0;
  return {
    lockfileInstalled: install.code === 0,
    lockfileSkipped: !shouldPrepare,
    offlineStartup: canSmoke ? await smokeOffline(sandbox) : null,
  };
};

/** @template T @param {T|null} value @param {T} replacement */
const fallback = (value, replacement) => (value === null ? replacement : value);

/** Measure the checkout and runtime, mutating only dependencies and an offline Surfpool smoke. */
/** @param {SandboxSession} sandbox @param {VerificationInput} input @param {string|null|undefined} observedRemote */
export const measure = async (sandbox, input, observedRemote) => {
  const checkout = await measureCheckout(sandbox);
  const runtime = await measureRuntime(sandbox);
  const shouldPrepare = canPrepare(checkout, input, observedRemote);
  const prepared = await prepareRuntime(
    sandbox,
    shouldPrepare,
    input.scope === "full" && runtime.surfpoolPath !== null,
  );
  return {
    actualHead: fallback(checkout.actualHead, "unknown"),
    architecture: fallback(checkout.architecture, "unknown"),
    branch: fallback(checkout.branch, ""),
    bunPath: runtime.bunPath,
    bunVersion: runtime.bunVersion,
    dirty: checkout.status === null || checkout.status !== "",
    expectedBranch: input.branch ?? null,
    expectedHead: input.expectedHead ?? null,
    expectedRemoteHead: input.expectedRemoteHead ?? null,
    ...prepared,
    platform: fallback(checkout.platform, "unknown"),
    remoteHead: observedRemote ?? null,
    remoteLookupFailed: input.branch !== undefined && observedRemote === undefined,
    requiredBunVersion: fallback(runtime.requiredBunVersion, "unknown"),
    requiredSurfpoolVersion: fallback(runtime.requiredSurfpoolVersion, "unknown"),
    scope: input.scope,
    surfpoolPath: runtime.surfpoolPath,
    surfpoolVersion: runtime.surfpoolVersion,
  };
};
