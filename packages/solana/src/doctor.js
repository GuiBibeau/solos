// @ts-check
/**
 * `solos doctor`: diagnose the Solana environment in one pass. Every missing or contradictory
 * piece is reported at once, nothing is thrown, and no secret value is ever resolved. `env.js`
 * owns loading a good environment; this owns describing a bad one.
 */
import { selectProfile } from "./credentials/resolve.js";
import { EnvSchema } from "./env.js";
import { rpcOrigin } from "./rpc/rpc-origin.js";

/** @typedef {{ code: string; reason: string; remedy: string }} Issue */
/** @typedef {import("./credentials/profile.js").Profile} Profile */
/** @typedef {{ name: string; profile: Profile }} Selected */

/** @param {import("zod").ZodError} error @returns {Issue[]} */
const invalidConfigIssues = (error) =>
  error.issues.map((issue) => ({
    code: "InvalidConfig",
    reason: `${issue.path.join(".")}: ${issue.message}`,
    remedy: "fix the environment value, then run `solos doctor` again",
  }));

/**
 * The signer the env vars imply, or null. Both set at once is itself a diagnosis.
 * @param {{ SOLOS_SIGNER_PRIVATE_KEY?: string; SOLOS_SIGNER_KEYPAIR_PATH?: string }} env
 * @returns {{ signer: string | null; issues: Issue[] }}
 */
const signerDiagnosis = (env) => {
  const hasKey = Boolean(env.SOLOS_SIGNER_PRIVATE_KEY);
  const hasFile = Boolean(env.SOLOS_SIGNER_KEYPAIR_PATH);
  if (hasKey && hasFile) {
    return {
      signer: null,
      issues: [
        {
          code: "SignerConflict",
          reason: "both SOLOS_SIGNER_PRIVATE_KEY and SOLOS_SIGNER_KEYPAIR_PATH are set",
          remedy: "unset one of them",
        },
      ],
    };
  }
  if (hasKey) return { signer: "privateKey (env)", issues: [] };
  if (hasFile) return { signer: "keypairPath (env)", issues: [] };
  return { signer: null, issues: [] };
};

/**
 * A `local` profile whose schema passed but which names no keypair path or key: the file loads,
 * and every real command still throws. Caught here so doctor cannot certify it.
 * @param {Selected | undefined} selected
 * @returns {Issue | null}
 */
const profileSignerIssue = (selected) => {
  const profile = selected?.profile;
  if (profile === undefined || profile.provider !== "local") return null;
  if (profile.keypairPath || profile.privateKey) return null;
  return {
    code: "ProfileSignerMissing",
    reason: `local profile "${selected?.name}" has neither keypairPath nor privateKey`,
    remedy: "re-run `solos login` so the profile carries a signer source",
  };
};

/** @param {Record<string, string | undefined>} env @returns {{ selected: Selected | undefined; issues: Issue[] }} */
const profileDiagnosis = (env) => {
  try {
    const selected = selectProfile(env);
    const issue = profileSignerIssue(selected);
    return { selected, issues: issue === null ? [] : [issue] };
  } catch (error) {
    return {
      selected: undefined,
      issues: [
        {
          code: "ProfileNotFound",
          reason: error instanceof Error ? error.message : String(error),
          remedy: "run `solos login` to create the profile, or unset SOLOS_PROFILE",
        },
      ],
    };
  }
};

/**
 * @param {string | null} envSigner @param {Selected | undefined} selected @param {Issue[]} issues
 */
const signerResult = (envSigner, selected, issues) => {
  if (envSigner !== null) return envSigner;
  if (selected !== undefined) return `${selected.profile.provider} (profile)`;
  const explained = issues.some(
    (issue) => issue.code === "SignerConflict" || issue.code.startsWith("Profile"),
  );
  if (!explained) {
    issues.push({
      code: "SignerConfigMissing",
      reason:
        "no signer: set SOLOS_SIGNER_KEYPAIR_PATH / SOLOS_SIGNER_PRIVATE_KEY, or run `solos login`",
      remedy: "run `solos login` to save a profile, or export SOLOS_SIGNER_KEYPAIR_PATH",
    });
  }
  return null;
};

/** @param {Profile | undefined} profile */
const hasNoRpcUrl = (profile) => profile !== undefined && !profile.rpcUrl;

/** @param {Selected | undefined} selected @param {Issue[]} issues */
const pushRpcIssue = (selected, issues) => {
  const isProfileTrap = hasNoRpcUrl(selected?.profile);
  issues.push({
    code: isProfileTrap ? "ProfileRpcUrlMissing" : "RpcConfigMissing",
    reason: isProfileTrap
      ? `the active profile "${selected?.name}" has no rpcUrl and SOLANA_RPC_URL is unset`
      : "SOLANA_RPC_URL is not set and there is no profile rpcUrl",
    remedy: "export SOLANA_RPC_URL, or run `solos login --rpc-url <url>`",
  });
};

/**
 * The RPC URL the runtime would use, or null with a recorded issue. The profile is only consulted
 * when the signer did not come from the environment, matching `loadSolanaEnv`.
 * @param {string | undefined} envRpcUrl @param {Selected | undefined} selected @param {Issue[]} issues
 */
const rpcDiagnosis = (envRpcUrl, selected, issues) => {
  const rpcUrl = envRpcUrl ?? selected?.profile.rpcUrl ?? null;
  if (rpcUrl !== null) return rpcUrl;
  pushRpcIssue(selected, issues);
  return null;
};

/** The endpoint origin only: a provider URL can carry a credential in its path or query.
 * @param {string | null} rpcUrl */
const originOf = (rpcUrl) => {
  if (rpcUrl === null) return null;
  try {
    return rpcOrigin(rpcUrl);
  } catch {
    return null;
  }
};

/**
 * @param {Selected | undefined} selected
 * @param {{ rpcUrl: string | null; signer: string | null }} resolved
 * @param {Issue[]} issues
 */
const toReport = (selected, resolved, issues) => {
  const profile = selected?.profile;
  return {
    ok: issues.length === 0,
    profile: selected?.name ?? null,
    provider: profile?.provider ?? null,
    rpcOrigin: originOf(resolved.rpcUrl),
    signer: resolved.signer,
    issues,
  };
};

/** @param {Record<string, string | undefined>} env */
export const diagnoseSolanaEnv = (env) => {
  const parsed = EnvSchema.safeParse(env);
  // An invalid field is reported alongside the rest, never instead of the rest: fixing one value
  // must not be the only way to learn about the next.
  const data = parsed.success ? parsed.data : env;
  /** @type {Issue[]} */
  const issues = parsed.success ? [] : invalidConfigIssues(parsed.error);
  const fromEnv = signerDiagnosis(data);
  issues.push(...fromEnv.issues);
  const diagnosis =
    fromEnv.signer === null ? profileDiagnosis(env) : { selected: undefined, issues: [] };
  issues.push(...diagnosis.issues);
  const signer = signerResult(fromEnv.signer, diagnosis.selected, issues);
  const rpcUrl = rpcDiagnosis(data.SOLANA_RPC_URL, diagnosis.selected, issues);
  return toReport(diagnosis.selected, { rpcUrl, signer }, issues);
};
