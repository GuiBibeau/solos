// @ts-check
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EngineConfigMissing, ValidationError } from "@solos/core";

/** @typedef {"read" | "simulate" | "execute"} Tier */
/** @typedef {"dry" | "paper" | "live"} Mode */

const TIER_NAMES = new Set(["read", "simulate", "execute"]);

/** @param {string | undefined} value @returns {value is Tier} */
const isTier = (value) => value !== undefined && TIER_NAMES.has(value);

/**
 * Blank means the default. A set but unknown value fails startup rather than silently widening.
 * @param {Record<string, string | undefined>} env
 * @returns {Tier}
 */
const tierFromEnv = (env) => {
  const value = env.SOLOS_TOOL_TIER;
  if (value === undefined || value === "") return "simulate";
  if (!isTier(value)) {
    throw new ValidationError({
      field: "SOLOS_TOOL_TIER",
      value,
      reason: "SOLOS_TOOL_TIER must be read, simulate or execute",
      remedy: "unset SOLOS_TOOL_TIER or set it to read, simulate or execute",
    });
  }
  return value;
};

/**
 * The flag wins over `SOLOS_TOOL_TIER`. `--paper` implies execute only when `--tier` was omitted.
 * @param {{ tier?: Tier; paper: boolean; env: Record<string, string | undefined> }} input
 * @returns {Tier}
 */
export const resolveTier = (input) => {
  if (input.tier !== undefined) return input.tier;
  if (input.paper) return "execute";
  return tierFromEnv(input.env);
};

/**
 * @param {boolean} paper
 * @param {Tier} tier
 * @returns {Mode}
 */
export const modeOf = (paper, tier) => {
  if (paper) return "paper";
  if (tier === "execute") return "live";
  return "dry";
};

/** @param {Record<string, string | undefined>} env */
export const defaultDataDir = (env) => {
  const base = env.SOLOS_CONFIG_DIR ?? path.join(os.homedir(), ".config", "solos");
  return path.join(base, "engine");
};

/** @param {Record<string, string | undefined>} env */
export const requireToken = (env) => {
  const token = env.SOLOS_ENGINE_TOKEN;
  if (token === undefined || token.length === 0) {
    throw new EngineConfigMissing({
      reason: "SOLOS_ENGINE_TOKEN is not set",
      remedy: "export SOLOS_ENGINE_TOKEN",
    });
  }
  return token;
};

/**
 * @param {{
 *   env: Record<string, string | undefined>;
 *   tier?: Tier;
 *   paper?: boolean;
 *   host?: string;
 *   port?: number;
 *   dataDir?: string;
 * }} input
 */
export const resolveStart = (input) => {
  const isPaper = input.paper === true;
  const tier = resolveTier({ tier: input.tier, paper: isPaper, env: input.env });
  const dataDir = input.dataDir ?? defaultDataDir(input.env);
  mkdirSync(dataDir, { recursive: true });
  return {
    token: requireToken(input.env),
    paper: isPaper,
    tier,
    mode: modeOf(isPaper, tier),
    host: input.host ?? "127.0.0.1",
    port: input.port ?? 8787,
    dataDir,
  };
};
