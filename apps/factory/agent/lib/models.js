// @ts-check
/**
 * One place to change every station's model. Ids use `<vendor>/<model>` and are read from
 * `FACTORY_MODEL_*` with defaults. Each `agent.js` reads its entry
 * here instead of hardcoding a string. Z.ai models use the Coding Plan endpoint directly;
 * other vendors continue through the gateway.
 *
 * The factory never holds a gateway key itself: the gateway authenticates with the deployment's
 * OIDC token. `AI_GATEWAY_API_KEY` is not read here and never reaches a sandbox.
 */

import { createZaiModel } from "./zai-model.js";

const DEFAULT_MODEL = "zai/glm-5.3-flash";

/** Different vendor from the implementer on purpose: independent review. */
const DEFAULT_REVIEWER_MODEL = "openai/gpt-5.6-luna";

/**
 * Gateway providers allowed to serve DeepSeek models. The gateway's cheapest DeepSeek route is
 * Alibaba-hosted and runs an output content inspection that rejects ordinary solOS vocabulary
 * (signer, private key, mainnet) as "inappropriate content", killing the station mid-turn. These
 * first-party and neutral hosts serve the same model with tool calling and no inspection layer.
 * Override with FACTORY_GATEWAY_PROVIDERS (comma-separated gateway provider slugs).
 */
const DEFAULT_DEEPSEEK_PROVIDERS = ["deepseek", "fireworks", "deepinfra", "runware"];

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

/** @typedef {import("eve").AgentModelOptionsDefinition} AgentModelOptionsDefinition */

/**
 * Per-model AI SDK options forwarded to the gateway. Only DeepSeek needs provider pinning today;
 * other vendors route by the gateway's defaults.
 * @param {string} model
 * @returns {AgentModelOptionsDefinition | undefined}
 */
export const modelOptionsFor = (model) => {
  if (vendorOf(model) === "zai")
    return {
      providerOptions: {
        zai: { thinking: { clear_thinking: false, type: "enabled" }, tool_stream: true },
      },
    };
  if (vendorOf(model) !== "deepseek") return undefined;
  const only = fromEnv("FACTORY_GATEWAY_PROVIDERS", DEFAULT_DEEPSEEK_PROVIDERS.join(","))
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug !== "");
  return { providerOptions: { gateway: { only } } };
};

/** @param {FactoryAgent} station */
export const modelConfigFor = (station) => {
  const id = MODELS[station];
  const isDirect = vendorOf(id) === "zai";
  return {
    model: isDirect ? createZaiModel(id.slice(4)) : id,
    ...(isDirect && { modelContextWindowTokens: 1_000_000 }),
    modelOptions: modelOptionsFor(id),
  };
};
