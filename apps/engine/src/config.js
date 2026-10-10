// @ts-check
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { durationMs } from "@solos-sh/actions";
import { EngineConfigMissing, ValidationError } from "@solos/core";
import { AddressSchema } from "@solos-sh/actions";

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

/**
 * Live requires an explicit allowlist. `[]` is every mint (`--allowed-mints any`).
 * Paper and dry default to every mint when the flag was omitted.
 * @param {{ mode: Mode; allowedMints?: ReadonlyArray<string> }} input
 * @returns {ReadonlyArray<string>}
 */
export const resolveAllowedMints = (input) => {
  if (input.allowedMints !== undefined) return input.allowedMints;
  if (input.mode === "live") refusedAllowlist();
  return [];
};

const refusedAllowlist = () => {
  throw new EngineConfigMissing({
    reason: "--allowed-mints is required when the engine tier is execute",
    remedy: "pass --allowed-mints with mint addresses, or --allowed-mints any to allow every mint",
  });
};

/**
 * `--allowed-mints any` is every mint. Anything else is a comma-separated address list.
 * @param {string} raw
 * @returns {ReadonlyArray<string>}
 */
export const parseAllowedMintsFlag = (raw) => {
  const trimmed = raw.trim();
  if (trimmed === "any") return [];
  const mints = listedMints(trimmed);
  if (mints !== undefined) return mints;
  throw new ValidationError({
    field: "allowed-mints",
    value: null,
    reason: "allowed-mints entries must be mint addresses, or the word any",
    remedy: "pass comma-separated base58 mint addresses, or --allowed-mints any",
  });
};

/** @param {string} raw @returns {ReadonlyArray<string> | undefined} */
const listedMints = (raw) => {
  const mints = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (mints.length === 0 || mints.some((mint) => !AddressSchema.safeParse(mint).success)) {
    return undefined;
  }
  return mints;
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
 *   minIntervalMs?: number;
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
    minIntervalMs: input.minIntervalMs ?? intervalFromEnv(input.env),
    tickWindow: windowFromEnv(input.env),
  };
};

/** The flag wins because the caller passes `minIntervalMs` before this reads the env. @param {Record<string, string | undefined>} env */
const intervalFromEnv = (env) => {
  const value = env.SOLOS_STRATEGY_MIN_INTERVAL;
  if (value === undefined || value === "") return 10_000;
  return requiredDuration("SOLOS_STRATEGY_MIN_INTERVAL", value);
};

/** @param {Record<string, string | undefined>} env */
const windowFromEnv = (env) => {
  const value = env.SOLOS_TICK_WINDOW;
  if (value === undefined || value === "") return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError({
      field: "SOLOS_TICK_WINDOW",
      value,
      reason: "SOLOS_TICK_WINDOW must be a positive integer",
      remedy: "unset SOLOS_TICK_WINDOW or set it to a positive integer",
    });
  }
  return parsed;
};

/** @param {string} field @param {string} value */
const requiredDuration = (field, value) => {
  const ms = durationMs(value);
  if (ms !== undefined) return ms;
  throw new ValidationError({
    field,
    value,
    reason: `${field} must be a duration such as 10s, 1m, or PT1M`,
    remedy: "use a positive duration such as 10s",
  });
};

/** Operator flag. Undefined when the flag was omitted. @param {string} value */
export const parseMinInterval = (value) => requiredDuration("min-interval", value);
