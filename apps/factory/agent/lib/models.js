// @ts-check
/**
 * One place to change every station's model. Ids are Vercel AI Gateway strings
 * (`<vendor>/<model>`), read from `FACTORY_MODEL_*` with defaults, so routing, credentials, and
 * fallbacks stay on the gateway and no provider SDK is wired in. Each `agent.js` reads its entry
 * here (`model: MODELS.<agent>`) instead of hardcoding a string.
 *
 * The factory never holds a gateway key itself: the gateway authenticates with the deployment's
 * OIDC token. `AI_GATEWAY_API_KEY` is not read here and never reaches a sandbox.
 */

const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

/** Different vendor from the implementer on purpose: independent review. */
const DEFAULT_REVIEWER_MODEL = "alibaba/qwen3.8-flash";

/**
 * @param {string} name
 * @param {string} fallback
 */
const fromEnv = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

/**
 * The `<vendor>` half of a gateway model id.
 * @param {string} model
 */
export const vendorOf = (model) => model.split("/", 1)[0] ?? "";

/**
 * The reviewer must not share a vendor with the implementer: fresh eyes are the station's point,
 * and a model from the same family shares the implementer's idiom and blind spots. Runs at module
 * load so a misconfigured deployment fails discovery instead of shipping self-review.
 * @template {{ implementer: string; reviewer: string }} T
 * @param {T} models
 * @returns {T}
 */
export const assertIndependentReviewer = (models) => {
  const implementer = vendorOf(models.implementer);
  const reviewer = vendorOf(models.reviewer);
  if (implementer === "" || reviewer === "" || implementer === reviewer) {
    throw new Error(
      `FACTORY_MODEL_REVIEWER (${models.reviewer}) must come from a different vendor than FACTORY_MODEL_IMPLEMENTER (${models.implementer}).`,
    );
  }
  return models;
};

export const MODELS = assertIndependentReviewer(
  Object.freeze({
    analyst: fromEnv("FACTORY_MODEL_ANALYST", DEFAULT_MODEL),
    classifier: fromEnv("FACTORY_MODEL_CLASSIFIER", DEFAULT_MODEL),
    implementer: fromEnv("FACTORY_MODEL_IMPLEMENTER", DEFAULT_MODEL),
    orchestrator: fromEnv("FACTORY_MODEL_ORCHESTRATOR", DEFAULT_MODEL),
    researcher: fromEnv("FACTORY_MODEL_RESEARCHER", DEFAULT_MODEL),
    reviewer: fromEnv("FACTORY_MODEL_REVIEWER", DEFAULT_REVIEWER_MODEL),
  }),
);

/** @typedef {keyof typeof MODELS} FactoryAgent */
