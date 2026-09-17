// @ts-check
import { randomSeed, seedToPrivateKeyString, startSurfnet } from "@solos/solana/surfnet";
import {
  IRIS_CASES,
  IRIS_ENDPOINT,
  IRIS_QUESTION,
  runIrisCase,
  skippedCase,
} from "./iris-cases.js";
import { IrisQaSchema } from "./schema.js";

/** @typedef {{ apiKey?: string; baseUrl?: string }} IrisQaConfig */

/** @param {string} reason @param {string} [baseUrl]
 * @returns {import("./schema.js").IrisQa}
 */
export const blockedIrisQa = (reason, baseUrl = IRIS_ENDPOINT) => ({
  capability: "iris",
  mode: baseUrl === IRIS_ENDPOINT ? "live" : "fixture",
  endpoint: `${baseUrl}/v2/chat`,
  status: "blocked",
  reason,
  question: IRIS_QUESTION,
  maxProviderRequests: 2,
  callsStarted: 0,
  reportedCredits: 0,
  usageComplete: true,
  answerQuality: "unassessed",
  cases: [skippedCase(IRIS_CASES[0]), skippedCase(IRIS_CASES[1])],
});

/** Fixed provider for operators; only loopback overrides are accepted for reusable tests.
 * @param {string} baseUrl
 */
const allowedEndpoint = (baseUrl) => {
  const url = new URL(baseUrl);
  return (
    baseUrl === IRIS_ENDPOINT ||
    (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.origin === baseUrl)
  );
};

/** At most one CLI call and one MCP call; stop at first failure, never retry paid requests.
 * @param {Record<string, string> & { ELFA_API_KEY: string }} env @param {import("./schema.js").IrisQa} report
 */
const exerciseCases = async (env, report) => {
  for (const [i, spec] of IRIS_CASES.entries()) {
    report.callsStarted++;
    /** @type {import("./schema.js").QaCase} */
    const result = await runIrisCase(spec, env).catch(() => ({
      ...skippedCase(spec),
      status: /** @type {const} */ ("failed"),
      code: "QaExecutionFailed",
    }));
    report.cases[i] = result;
    report.reportedCredits += result.answer?.creditsConsumed ?? 0;
    if (result.status !== "passed") {
      report.usageComplete = false;
      report.status = result.code === "IrisAuthFailed" ? "blocked" : "failed";
      report.reason = result.code;
      return report;
    }
  }
  report.status = "passed";
  delete report.reason;
  return report;
};

/** Starts its own offline Surfpool and disposable signer; no profiles, RPCs or wallet funds.
 * @param {IrisQaConfig} config
 * @returns {Promise<import("./schema.js").IrisQa>}
 */
export const runIrisQa = async ({ apiKey, baseUrl = IRIS_ENDPOINT }) => {
  if (!apiKey?.trim()) return blockedIrisQa("ELFA_API_KEY is not configured", baseUrl);
  if (!allowedEndpoint(baseUrl)) throw new Error("QA requires Elfa or a loopback fixture");
  const report = blockedIrisQa("QA did not complete", baseUrl);
  const surfnet = await startSurfnet({});
  try {
    const env = {
      PATH: process.env.PATH ?? "",
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLANA_WS_URL: surfnet.wsUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
      ELFA_API_KEY: apiKey,
      ELFA_BASE_URL: baseUrl,
    };
    await exerciseCases(env, report);
  } catch {
    report.status = "failed";
    report.reason = "QaExecutionFailed";
    report.usageComplete = report.callsStarted === 0;
  } finally {
    await surfnet.stop().catch(() => {
      report.status = "failed";
      report.reason = "SurfpoolCleanupFailed";
    });
  }
  return IrisQaSchema.parse(report);
};
