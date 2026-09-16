// @ts-check
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { credentialsPath } from "./paths.js";
import { CredentialsFileSchema, EMPTY_CREDENTIALS } from "./profile.js";

/**
 * Read the credentials file, or an empty document when it does not exist.
 * @param {Record<string, string | undefined>} env
 * @returns {import("./profile.js").CredentialsFile}
 */
export const readCredentials = (env) => {
  const file = credentialsPath(env);
  if (!existsSync(file)) return EMPTY_CREDENTIALS;
  return CredentialsFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
};

/**
 * Write atomically (temp file + rename) with 0600 on the file and 0700 on the directory.
 * @param {Record<string, string | undefined>} env
 * @param {import("./profile.js").CredentialsFile} credentials
 */
export const writeCredentials = (env, credentials) => {
  const file = credentialsPath(env);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(CredentialsFileSchema.parse(credentials), null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temp, file);
  chmodSync(file, 0o600);
  return file;
};

/**
 * Add or replace a profile. The first profile written becomes the default.
 * @param {Record<string, string | undefined>} env
 * @param {{ name: string; profile: import("./profile.js").Profile; setDefault?: boolean }} input
 */
export const saveProfile = (env, { name, profile, setDefault = false }) => {
  const current = readCredentials(env);
  const isFirst = Object.keys(current.profiles).length === 0;
  const next = {
    ...current,
    default: isFirst || setDefault ? name : current.default,
    profiles: { ...current.profiles, [name]: profile },
  };
  return writeCredentials(env, next);
};

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
export const removeProfile = (env, name) => {
  const current = readCredentials(env);
  const profiles = Object.fromEntries(
    Object.entries(current.profiles).filter(([key]) => key !== name),
  );
  const remaining = Object.keys(profiles);
  const fallback = remaining[0];
  return writeCredentials(env, {
    ...current,
    default: current.default === name ? fallback : current.default,
    profiles,
  });
};

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
export const setDefaultProfile = (env, name) => {
  const current = readCredentials(env);
  if (!Object.hasOwn(current.profiles, name)) throw new Error(`no profile named "${name}"`);
  return writeCredentials(env, { ...current, default: name });
};
