// @ts-check
import { Effect } from "effect";
import { isExposed, isWithinCeiling } from "../domain/catalogue.js";
import { SelectionInputInvalid } from "../domain/errors.js";
import { searchNotes } from "../domain/search-notes.js";
import { ToolCatalogue } from "../ports/tool-catalogue.js";
import { selectTools } from "./select-tools.js";

/** @typedef {import("../domain/types.js").CatalogueTool} CatalogueTool */
/** @typedef {import("../domain/types.js").SearchToolsInput} SearchToolsInput */
/** @typedef {import("../ports/tool-catalogue.js").ToolCatalogueShape} Catalogue */
/** @typedef {"query" | "group" | "names"} SearchMode */
/**
 * What one mode found, before the cap: the tools in rank order, any score the selector gave,
 * the names that were not tools, and who ranked (query mode only).
 * @typedef {{
 *   readonly found: ReadonlyArray<CatalogueTool>;
 *   readonly scores?: ReadonlyMap<string, number>;
 *   readonly matched: number;
 *   readonly unknown: ReadonlyArray<string>;
 *   readonly selector?: string;
 *   readonly fallback?: string;
 * }} Found
 */

/**
 * Exactly one of the three modes, or the request is refused before anything is ranked.
 * @param {SearchToolsInput} input
 * @returns {Effect.Effect<SearchMode, SelectionInputInvalid>}
 */
const modeOf = (input) => {
  /** @type {SearchMode[]} */
  const given = [];
  if (input.query !== undefined) given.push("query");
  if (input.group !== undefined) given.push("group");
  if (input.names !== undefined) given.push("names");
  const [mode] = given;
  return mode !== undefined && given.length === 1
    ? Effect.succeed(mode)
    : Effect.fail(
        new SelectionInputInvalid({ reason: "give exactly one of query, group or names" }),
      );
};

/**
 * Exact names, in the order given, each once; the rest are unknown.
 * @param {ReadonlyArray<CatalogueTool>} tools
 * @param {ReadonlyArray<string>} names
 * @returns {Found}
 */
const byNames = (tools, names) => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const unique = [...new Set(names)];
  const found = unique.flatMap((name) => {
    const tool = byName.get(name);
    return tool === undefined ? [] : [tool];
  });
  return { found, matched: found.length, unknown: unique.filter((name) => !byName.has(name)) };
};

/**
 * @param {ReadonlyArray<CatalogueTool>} tools
 * @param {string} group
 * @returns {Found}
 */
const byGroup = (tools, group) => {
  const found = tools.filter((tool) => tool.group === group);
  return { found, matched: found.length, unknown: [] };
};

/**
 * Free text through the configured selector, uncapped here so availability is counted over
 * every match; `assemble` applies the cap to what is listed.
 * @param {ReadonlyArray<CatalogueTool>} tools
 * @param {string} query
 * @returns {Effect.Effect<Found, SelectionInputInvalid, import("../ports/tool-selector.js").ToolSelectorShape>}
 */
const byQuery = (tools, query) =>
  Effect.map(selectTools({ query, tools, limit: tools.length }), (selection) => {
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    return {
      found: selection.matches.flatMap((match) => {
        const tool = byName.get(match.name);
        return tool === undefined ? [] : [tool];
      }),
      scores: new Map(selection.matches.map((match) => [match.name, match.score])),
      matched: selection.matched,
      unknown: [],
      selector: selection.selector,
      ...(selection.fallback !== undefined && { fallback: selection.fallback }),
    };
  });

/**
 * @param {SearchMode} mode
 * @param {SearchToolsInput} input
 * @param {ReadonlyArray<CatalogueTool>} tools
 */
const rank = (mode, input, tools) => {
  if (mode === "names") return Effect.succeed(byNames(tools, input.names ?? []));
  if (mode === "group") return Effect.succeed(byGroup(tools, input.group ?? ""));
  return byQuery(tools, input.query ?? "");
};

/**
 * The result a Caller reads: every listed match with its availability under the ceiling, the
 * counts, the registry's groups, and the notes that say what to do next.
 * @param {{ mode: SearchMode; limit: number; catalogue: Catalogue; result: Found }} parts
 */
const assemble = ({ mode, limit, catalogue, result }) => {
  const isAvailable = (/** @type {CatalogueTool} */ tool) => isExposed(tool, catalogue);
  const isAboveCeiling = (/** @type {CatalogueTool} */ tool) =>
    !isWithinCeiling(tool.tier, catalogue.ceiling);
  const isExperimentalWithheld = (/** @type {CatalogueTool} */ tool) =>
    tool.stability === "experimental" && !catalogue.experimental;
  // Over everything that matched, not only what the cap lists.
  const withheld = result.found.filter((tool) => !isAvailable(tool));
  const matches = result.found.slice(0, limit).map((tool) => ({
    ...tool,
    available: isAvailable(tool),
    ...(result.scores?.has(tool.name) && { score: result.scores.get(tool.name) }),
  }));
  const groups = [...new Set(catalogue.tools.map((tool) => tool.group))].toSorted((a, b) =>
    a.localeCompare(b),
  );
  return {
    mode,
    ...(result.selector !== undefined && { selector: result.selector }),
    ...(result.fallback !== undefined && { fallback: result.fallback }),
    matches,
    matched: result.matched,
    unknown: result.unknown,
    groups,
    ceiling: catalogue.ceiling,
    notes: searchNotes({
      mode,
      listed: matches.length,
      matched: result.matched,
      unknown: result.unknown.length,
      groups,
      ceiling: catalogue.ceiling,
      // A tool both above the ceiling and experimental counts under both gates: lifting one
      // alone would not make it callable, so the Caller hears both remedies.
      unavailable: withheld.filter((tool) => isAboveCeiling(tool)).map((tool) => tool.tier),
      experimental: withheld.filter((tool) => isExperimentalWithheld(tool)).length,
    }),
  };
};

/**
 * Rank the catalogue against one request in exactly one mode. Every match is named, including
 * those above the tier ceiling or withheld as experimental, which are marked unavailable rather
 * than dropped; the notes say when more matched than were listed, what solOS covers when
 * nothing did, how to raise the ceiling (ADR-0029) and how to enable experimental tools
 * (ADR-0036).
 * @param {SearchToolsInput} input
 */
export const searchTools = (input) =>
  Effect.gen(function* () {
    const mode = yield* modeOf(input);
    const catalogue = yield* ToolCatalogue;
    const result = yield* rank(mode, input, catalogue.tools);
    return assemble({ mode, limit: input.limit, catalogue, result });
  }).pipe(Effect.withSpan("discovery.searchTools"));
