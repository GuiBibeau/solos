// @ts-check
/** Pure half of the docs gate: what a document holds versus what the registry renders. */
import { readRegion } from "./regions.js";

/** @typedef {{ status: "current" | "stale" | "missing", detail: string }} Comparison */

/** A table row's first cell, an HTML article's id or an H3: the tool or slice name either way. */
const KEY_PATTERNS = [/^\|\s*`([^`]+)`/u, /^<article class="tool" id="([^"]+)"/u, /^### (\S+)$/u];

/** @param {string} text */
const keysOf = (text) =>
  text
    .split("\n")
    .flatMap((line) => KEY_PATTERNS.flatMap((pattern) => pattern.exec(line)?.[1] ?? []));

/**
 * Which rows drifted, named. The message is usually the whole fix, so it beats a row count.
 * @param {string} found @param {string} expected @returns {string}
 */
export const describeDrift = (found, expected) => {
  const current = keysOf(found);
  const wanted = keysOf(expected);
  const undocumented = wanted.filter((key) => !current.includes(key));
  const removed = current.filter((key) => !wanted.includes(key));
  const parts = [];
  if (undocumented.length > 0) parts.push(`undocumented: ${undocumented.join(", ")}`);
  if (removed.length > 0) parts.push(`no longer in the registry: ${removed.join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : "same rows, different rendering";
};

/**
 * Compare one document's region against the body the registry renders for it.
 * @param {{ text: string, region: string, body: string }} input
 * @returns {Comparison}
 */
export const compareRegion = ({ text, region, body }) => {
  const found = readRegion(text, region);
  if (found === null) return { status: "missing", detail: `no "${region}" region` };
  if (found === body) return { status: "current", detail: "" };
  return { status: "stale", detail: describeDrift(found, body) };
};
