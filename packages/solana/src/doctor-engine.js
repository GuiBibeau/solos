// @ts-check
import { engineConfigIssues } from "./env-engine.js";

/** Local-signer complaints that do not apply once the Engine holds the key. */
const DROPPED = new Set(["SignerConfigMissing", "ProfileSignerMissing"]);

/**
 * Engine mode needs no local signer. Drop those issues, record a missing URL or token, and
 * report the signer as the engine unless the env itself contradicts (both signer vars set).
 * @param {Record<string, string | undefined>} env
 * @param {Array<{ code: string }>} issues
 * @returns {string | null} `"engine"` when that label should replace the local signer, else null
 */
export const applyEngineDiagnosis = (env, issues) => {
  if (env.SOLOS_EXECUTOR !== "engine") return null;
  for (let index = issues.length - 1; index >= 0; index -= 1) {
    const issue = issues[index];
    if (issue !== undefined && DROPPED.has(issue.code)) issues.splice(index, 1);
  }
  issues.push(...engineConfigIssues(env));
  if (issues.some((issue) => issue.code === "SignerConflict")) return null;
  return "engine";
};
