// @ts-check
/**
 * The docs gate. Narrative documentation was the one part of the repo with no machine check on
 * it, and it drifted thirteen tools and five slices behind the registry. AGENTS.md asks for a
 * `solos` command rather than a throwaway script when a verification step is missing; this is it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { allTools, SUPPORTED_VENUES } from "@solos/core";
import { compareRegion } from "./compare.js";
import { replaceRegion } from "./regions.js";
import { renderToolsHtml } from "./render-html.js";
import { renderToolsMarkdown } from "./render-llms.js";
import { renderSliceTable, renderToolTable, sliceNames } from "./render.js";
import { DocsReportSchema } from "./schema.js";
import { liveValidatedActions, stabilityProblems } from "./stability.js";

/** @typedef {import("./schema.js").DocsReport} DocsReport */
/** @typedef {{ file: string, region: string, body: string }} Target */

const ROOT = new URL("../../../../", import.meta.url);

/** @returns {Target[]} */
const targets = () => [
  { file: "docs/reference/tools/index.md", region: "tools", body: renderToolTable(allTools) },
  { file: "AGENTS.md", region: "slices", body: renderSliceTable(sliceNames(), allTools) },
  { file: "docs/reference/tools/liquidity.md", region: "liquidity-venues", body: SUPPORTED_VENUES },
  { file: "apps/landing/public/tools.html", region: "tools", body: renderToolsHtml(allTools) },
  {
    file: "apps/landing/public/llms-full.txt",
    region: "tools",
    body: renderToolsMarkdown(allTools),
  },
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

/** The feature map's rows: which execute paths a funded round has recorded. */
const featureRows = () =>
  /** @type {import("./stability.js").FeatureRow[]} */ (
    JSON.parse(readFileSync(new URL("features/feature-map.json", ROOT), "utf8"))
  );

/**
 * Compare every generated region against the registry, rewriting them when asked, and hold
 * every stable label to the feature map (ADR-0036).
 * @param {{ write: boolean }} options
 * @returns {DocsReport}
 */
export const checkDocs = ({ write }) => {
  const regions = targets().map((target) => reconcile(target, write));
  const problems = stabilityProblems(allTools, liveValidatedActions(featureRows()));
  const regionsOk = regions.every(
    (region) => region.status === "current" || region.status === "written",
  );
  return DocsReportSchema.parse({
    ok: regionsOk && problems.length === 0,
    write,
    regions,
    stability: { ok: problems.length === 0, problems },
  });
};
