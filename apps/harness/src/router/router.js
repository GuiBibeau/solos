// @ts-check
import { Context, Layer } from "effect";
import { PRESETS, otherPreset } from "./presets.js";

/**
 * @typedef {{
 *   readonly taskClass: import("../config.js").TaskClass;
 *   readonly model: string;
 *   readonly fallbacks: ReadonlyArray<string>;
 *   readonly reasoning: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
 * }} Route
 *
 * @typedef {{
 *   readonly preset: import("./presets.js").PresetName;
 *   readonly resolve: (taskClass: import("../config.js").TaskClass) => Route;
 * }} RouterShape
 */

export const Router = /** @type {Context.Tag<RouterShape, RouterShape>} */ (
  Context.GenericTag("@solos/harness/Router")
);

/**
 * Pure resolution: preset, then config override, then cross-provider fallback.
 * @param {import("./presets.js").PresetName} preset
 * @param {import("../config.js").HarnessConfig["router"]} routerConfig
 * @param {import("../config.js").TaskClass} taskClass
 * @returns {Route}
 */
export const resolveRoute = (preset, routerConfig, taskClass) => {
  const base = PRESETS[preset][taskClass];
  const override = routerConfig.overrides[taskClass];
  const model = override?.model ?? base.model;
  const crossProvider = routerConfig.crossProviderFallback
    ? [PRESETS[otherPreset(preset)][taskClass].model]
    : [];
  const fallbacks = [...(override?.fallbacks ?? []), ...crossProvider].filter((m) => m !== model);
  return {
    taskClass,
    model,
    fallbacks: [...new Set(fallbacks)],
    reasoning: override?.reasoning ?? base.reasoning,
  };
};

/**
 * @param {import("./presets.js").PresetName} preset
 * @param {import("../config.js").HarnessConfig["router"]} routerConfig
 */
export const RouterLive = (preset, routerConfig) =>
  Layer.succeed(Router, {
    preset,
    resolve: (taskClass) => resolveRoute(preset, routerConfig, taskClass),
  });

/**
 * AI SDK call settings for a route. String model ids resolve through the AI Gateway provider
 * bundled with `ai`; fallbacks ride along as gateway provider options.
 * @param {Route} route
 */
export const callSettingsFor = (route) => ({
  model: route.model,
  reasoning: route.reasoning,
  providerOptions: { gateway: { models: [...route.fallbacks] } },
});
