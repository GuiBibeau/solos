// @ts-check
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** `20261004T061500Z`: sortable, filesystem-safe, obviously a time. */
const stamp = () => new Date().toISOString().replaceAll(/[-:]|\.\d{3}/g, "");

/**
 * The file's text, or null when it does not exist yet.
 * @param {string} file
 */
export const readIfExists = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/**
 * Write a config file, keeping a timestamped copy of what was there. The backup sits next to the
 * file so an Operator can diff or restore it with no tooling.
 * @param {string} file @param {string} contents
 * @returns {{ file: string; backup: string | null }}
 */
export const writeWithBackup = (file, contents) => {
  mkdirSync(path.dirname(file), { recursive: true });
  const backup = existsSync(file) ? `${file}.bak-${stamp()}` : null;
  if (backup !== null) copyFileSync(file, backup);
  writeFileSync(file, contents);
  return { file, backup };
};
