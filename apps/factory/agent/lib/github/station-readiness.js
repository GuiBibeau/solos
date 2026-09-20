// @ts-check

/** @typedef {{code: string, message: string}} Diagnostic */
/** @typedef {"check" | "unit" | "full"} Scope */
/** @typedef {{actualHead: string, architecture: string, branch: string, bunPath: string|null, bunVersion: string|null, dirty: boolean, expectedBranch: string|null, expectedHead: string|null, expectedRemoteHead: string|null, lockfileInstalled: boolean, lockfileSkipped: boolean, offlineStartup: boolean|null, platform: string, remoteHead: string|null, remoteLookupFailed: boolean, requiredBunVersion: string, requiredSurfpoolVersion: string, scope: Scope, surfpoolPath: string|null, surfpoolVersion: string|null}} ReadinessFacts */

/** @param {string | null} actual @param {string} expected @param {string} [prefix] */
const isVersionExact = (actual, expected, prefix = "") => actual === `${prefix}${expected}`;

/** @param {ReadinessFacts} facts @returns {Diagnostic[]} */
const headDiagnostics = (facts) => {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  if (facts.expectedHead && facts.actualHead !== facts.expectedHead)
    diagnostics.push({
      code: "wrong-head",
      message: `Expected ${facts.expectedHead}, found ${facts.actualHead}.`,
    });
  if (facts.expectedBranch && facts.branch !== facts.expectedBranch)
    diagnostics.push({
      code: "wrong-branch",
      message: `Expected branch ${facts.expectedBranch}, found ${facts.branch}.`,
    });
  return diagnostics;
};

/** @param {ReadinessFacts} facts @returns {Diagnostic[]} */
const remoteDiagnostics = (facts) => {
  if (facts.remoteLookupFailed)
    return [
      {
        code: "remote-inspection-failed",
        message: "The remote branch could not be inspected reliably; verification was not run.",
      },
    ];
  if (
    !facts.expectedBranch ||
    !facts.expectedRemoteHead ||
    facts.remoteHead === facts.expectedRemoteHead
  )
    return [];
  return [
    {
      code: "remote-moved",
      message: `Remote is ${facts.remoteHead ?? "absent"}, not ${facts.expectedRemoteHead}.`,
    },
  ];
};

/** @param {ReadinessFacts} facts @returns {Diagnostic[]} */
const workspaceDiagnostics = (facts) => {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  if (facts.dirty)
    diagnostics.push({
      code: "dirty-checkout",
      message: "Uncommitted work was preserved; commit or preserve it, then retry verification.",
    });
  if (!facts.lockfileInstalled && !facts.lockfileSkipped)
    diagnostics.push({
      code: "lockfile-install-failed",
      message: "bun install --frozen-lockfile did not complete successfully.",
    });
  return diagnostics;
};

/** @param {ReadinessFacts} facts @returns {Diagnostic[]} */
const runtimeDiagnostics = (facts) => {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @param {string} code @param {string} message */
  const add = (code, message) => {
    diagnostics.push({ code, message });
  };
  if (!facts.bunPath) add("bun-missing", "Bun is not available on the effective PATH.");
  else if (!isVersionExact(facts.bunVersion, facts.requiredBunVersion))
    add(
      "bun-version-mismatch",
      `Bun ${facts.bunVersion ?? "unknown"} does not match ${facts.requiredBunVersion}.`,
    );
  return diagnostics;
};

/** @param {ReadinessFacts} facts @returns {Diagnostic[]} */
const surfpoolDiagnostics = (facts) => {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  if (!facts.surfpoolPath)
    diagnostics.push({
      code: "surfpool-missing",
      message: "Surfpool is not on the effective PATH.",
    });
  if (
    facts.surfpoolPath &&
    !isVersionExact(facts.surfpoolVersion, facts.requiredSurfpoolVersion, "surfpool ")
  )
    diagnostics.push({
      code: "surfpool-version-mismatch",
      message: `Surfpool ${facts.surfpoolVersion ?? "unknown"} does not match ${facts.requiredSurfpoolVersion}.`,
    });
  if (facts.offlineStartup === false)
    diagnostics.push({
      code: "surfpool-offline-startup-failed",
      message: "The pinned Surfpool did not become healthy offline.",
    });
  return diagnostics;
};

/** @param {ReadinessFacts} facts @returns {Diagnostic[]} */
const fullDiagnostics = (facts) => {
  if (facts.scope !== "full") return [];
  const platform =
    facts.platform === "Linux" && facts.architecture === "x86_64"
      ? []
      : [
          {
            code: "unsupported-architecture",
            message: `Full verification is not provisioned on ${facts.platform}/${facts.architecture}.`,
          },
        ];
  return [...platform, ...surfpoolDiagnostics(facts)];
};

/** Evaluate measured station facts without guessing capabilities from architecture or scope. */
/** @param {ReadinessFacts} facts */
export const evaluateReadiness = (facts) => {
  const diagnostics = [
    ...headDiagnostics(facts),
    ...remoteDiagnostics(facts),
    ...workspaceDiagnostics(facts),
    ...runtimeDiagnostics(facts),
    ...fullDiagnostics(facts),
  ];
  return { diagnostics, ready: diagnostics.length === 0 };
};
