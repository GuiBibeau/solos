// @ts-check
/**
 * Class → gateway model per provider (ADR-0009). Ids use the AI Gateway catalog spelling
 * (dots in versions). Neither provider is privileged in code; ROUTER_PRESET picks one.
 * @typedef {"none" | "minimal" | "low" | "medium" | "high" | "xhigh"} Reasoning
 * @typedef {{ readonly model: string; readonly reasoning: Reasoning }} PresetRoute
 * @typedef {Readonly<Record<import("../config.js").TaskClass, PresetRoute>>} Preset
 */

/** @type {Readonly<Record<"anthropic" | "openai", Preset>>} */
export const PRESETS = {
  anthropic: {
    fast: { model: "anthropic/claude-haiku-4.5", reasoning: "none" },
    default: { model: "anthropic/claude-sonnet-5", reasoning: "low" },
    reasoning: { model: "anthropic/claude-fable-5.1", reasoning: "high" },
  },
  openai: {
    fast: { model: "openai/gpt-5.6-luna", reasoning: "none" },
    default: { model: "openai/gpt-5.6-sol", reasoning: "low" },
    reasoning: { model: "openai/gpt-6-astra", reasoning: "high" },
  },
};

/** @typedef {keyof typeof PRESETS} PresetName */

/** @param {PresetName} name */
export const otherPreset = (name) => (name === "anthropic" ? "openai" : "anthropic");
