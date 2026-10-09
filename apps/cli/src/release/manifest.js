// @ts-check
/**
 * The registry manifest's two version fields, moved together (ADR-0036): `version` and
 * `packages[0].version` must equal the released npm version, and a release PR changes nothing
 * else in server.json. Pure over the text; the command reads and writes the file.
 */
import { ReleaseRefused } from "./errors.js";

/** @typedef {{ version?: unknown; packages?: Array<{ version?: unknown }> }} Manifest */

/**
 * @param {string | null} text the current server.json, null when the file is missing
 * @param {string} version
 * @returns {string} the new file text, two-space indented with a trailing newline
 */
export const bumpedManifest = (text, version) => {
  if (text === null) {
    throw new ReleaseRefused({
      reason: "server.json is missing",
      remedy: "run prepare from the solos checkout root, which holds the registry manifest",
    });
  }
  /** @type {Manifest} */
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReleaseRefused({
      reason: `server.json is not valid JSON: ${detail}`,
      remedy: "fix the manifest before preparing a release",
    });
  }
  const first = Array.isArray(manifest.packages) ? manifest.packages[0] : undefined;
  if (first === undefined) {
    throw new ReleaseRefused({
      reason: "server.json names no package",
      remedy: "the manifest needs packages[0] with the npm package the registry points at",
    });
  }
  manifest.version = version;
  first.version = version;
  return `${JSON.stringify(manifest, null, 2)}\n`;
};
