// @ts-check
import { homedir } from "node:os";
import path from "node:path";

/**
 * XDG-style config dir. `SOLOS_CONFIG_DIR` overrides it (tests, containers).
 * @param {Record<string, string | undefined>} env
 */
export const configDir = (env) =>
  env.SOLOS_CONFIG_DIR ??
  path.join(env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "solos");

/** @param {Record<string, string | undefined>} env */
export const credentialsPath = (env) => path.join(configDir(env), "credentials.json");

/** Where the Solana CLI keeps keypairs by default. */
export const solanaCliDir = () => path.join(homedir(), ".config", "solana");

/** Where the `pay` CLI keeps its account registry. */
export const payAccountsPath = () => path.join(homedir(), ".config", "pay", "accounts.yml");
