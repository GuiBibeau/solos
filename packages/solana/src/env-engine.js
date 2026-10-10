// @ts-check
import { EngineConfigMissing } from "@solos/core";

/**
 * @param {string} variable
 * @returns {{ readonly code: "EngineConfigMissing"; readonly reason: string; readonly remedy: string }}
 */
export const engineConfigIssue = (variable) => ({
  code: "EngineConfigMissing",
  reason: `${variable} is not set`,
  remedy: `export ${variable}`,
});

/**
 * Caller-side engine settings. Absent unless `SOLOS_EXECUTOR=engine`. A missing URL or token
 * throws the same way a missing RPC URL does: one tagged error whose reason names the variable.
 * @param {{ SOLOS_EXECUTOR: "direct" | "engine"; SOLOS_ENGINE_URL?: string; SOLOS_ENGINE_TOKEN?: string }} parsed
 * @returns {{ readonly url: string; readonly token: string } | undefined}
 */
export const engineCaller = (parsed) => {
  if (parsed.SOLOS_EXECUTOR !== "engine") return undefined;
  if (parsed.SOLOS_ENGINE_URL === undefined) {
    throw new EngineConfigMissing(engineConfigIssue("SOLOS_ENGINE_URL"));
  }
  if (parsed.SOLOS_ENGINE_TOKEN === undefined) {
    throw new EngineConfigMissing(engineConfigIssue("SOLOS_ENGINE_TOKEN"));
  }
  return { url: parsed.SOLOS_ENGINE_URL, token: parsed.SOLOS_ENGINE_TOKEN };
};

/**
 * Every engine setting doctor should report at once. Empty when the executor is not `engine`.
 * @param {Record<string, string | undefined>} env
 */
export const engineConfigIssues = (env) => {
  if (env.SOLOS_EXECUTOR !== "engine") return [];
  /** @type {Array<ReturnType<typeof engineConfigIssue>>} */
  const issues = [];
  if (!env.SOLOS_ENGINE_URL) issues.push(engineConfigIssue("SOLOS_ENGINE_URL"));
  if (!env.SOLOS_ENGINE_TOKEN) issues.push(engineConfigIssue("SOLOS_ENGINE_TOKEN"));
  return issues;
};
