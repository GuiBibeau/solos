// @ts-check
/**
 * The docs gate. Narrative documentation was the one part of the repo with no machine check on
 * it, and it drifted thirteen tools and five slices behind the registry. AGENTS.md asks for a
 * `solos` command rather than a throwaway script when a verification step is missing; this is it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { allTools } from "@solos/core";
import { compareRegion } from "./compare.js";
import { replaceRegion } from "./regions.js";
import { renderSliceTable, renderToolTable, sliceNames } from "./render.js";
import { DocsReportSchema } from "./schema.js";

/** @typedef {import("./schema.js").DocsReport} DocsReport */
/** @typedef {{ file: string, region: string, body: string }} Target */

const ROOT = new URL("../../../../", import.meta.url);

/** @returns {Target[]} */
const targets = () => [
  { file: "README.md", region: "tools", body: renderToolTable(allTools) },
  { file: "AGENTS.md", region: "slices", body: renderSliceTable(sliceNames(), allTools) },
];

/** @param {Target} target @param {boolean} write */
const reconcile = (target, write) => {
  const path = new URL(target.file, ROOT);
  const text = readFileSync(path, "utf8");
  const { status, detail } = compareRegion({ text, region: target.region, body: target.body });
  const at = { file: target.file, region: target.region };
  if (status !== "stale" || !write) return { ...at, status, detail };
  writeFileSync(path, replaceRegion(text, target.region, target.body));
  return { ...at, status: "written", detail };
};

/**
 * Compare every generated region against the registry, rewriting them when asked.
 * @param {{ write: boolean }} options
 * @returns {DocsReport}
 */
export const checkDocs = ({ write }) => {
  const regions = targets().map((target) => reconcile(target, write));
  return DocsReportSchema.parse({
    ok: regions.every((region) => region.status === "current" || region.status === "written"),
    write,
    regions,
  });
};
