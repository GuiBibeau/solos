// @ts-check
import { Duration, Effect } from "effect";
import { SelectionInputInvalid, ToolSelectorUnavailable } from "../domain/errors.js";
import { localMatches } from "../domain/local-match.js";
import { ToolSelector } from "../ports/tool-selector.js";

/** How many matches one selection returns; the rest are counted, not listed (ADR-0029). */
export const DEFAULT_SELECTION_LIMIT = 8;

/**
 * How long the configured selector may take before the local matcher answers instead.
 * Discovery is on the path to every tool, so a slow selector must cost a bounded wait, not a
 * stalled Caller. JEV answered in 0.6–1.0 s end to end from a slow link on 2026-09-28.
 */
export const DEFAULT_SELECTION_TIMEOUT_MS = 2000;

/**
 * The four fields a selector matches against, and nothing a definition carries beyond them.
 * @param {{ name: string; group: string; title: string; description: string }} tool
 * @returns {import("../domain/types.js").ToolSummary}
 */
const summaryOf = ({ name, group, title, description }) => ({ name, group, title, description });

/**
 * The two bounds a caller may set, checked before any selector runs: a count of matches is a
 * whole number, zero or more; a wait is a whole number of milliseconds, one or more. A negative
 * count would otherwise reach `slice` and drop matches from the end instead of capping them.
 * @param {number} limit
 * @param {number} timeoutMs
 * @returns {import("effect").Effect.Effect<void, SelectionInputInvalid>}
 */
const validateBounds = (limit, timeoutMs) => {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    return Effect.fail(
      new SelectionInputInvalid({
        reason: "limit must be a whole number of matches, zero or more",
      }),
    );
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return Effect.fail(
      new SelectionInputInvalid({
        reason: "timeoutMs must be a whole number of milliseconds, one or more",
      }),
    );
  }
  return Effect.void;
};

/**
 * Rank the given tools against one free-text request. Once its bounds are valid, selection never
 * fails: when the configured selector cannot answer, the local matcher does, and `fallback` says
 * why. A `limit` or `timeoutMs` outside its range is refused before any selector runs.
 * @param {{
 *   readonly query: string;
 *   readonly tools: ReadonlyArray<{ name: string; group: string; title: string; description: string }>;
 *   readonly limit?: number;
 *   readonly timeoutMs?: number;
 * }} input
 */
export const selectTools = ({
  query,
  tools,
  limit = DEFAULT_SELECTION_LIMIT,
  timeoutMs = DEFAULT_SELECTION_TIMEOUT_MS,
}) =>
  Effect.gen(function* () {
    yield* validateBounds(limit, timeoutMs);
    const selector = yield* ToolSelector;
    const summaries = tools.map(summaryOf);
    const ranked = yield* selector.select({ query, tools: summaries }).pipe(
      Effect.timeoutFail({
        duration: Duration.millis(timeoutMs),
        onTimeout: () =>
          new ToolSelectorUnavailable({
            reason: `the ${selector.name} selector did not answer within ${timeoutMs} ms, so the request was matched locally`,
          }),
      }),
      Effect.map((matches) => ({ selector: selector.name, matches, fallback: undefined })),
      Effect.catchTag("ToolSelectorUnavailable", (error) =>
        Effect.succeed({
          selector: "local",
          matches: localMatches(query, summaries),
          fallback: error.reason,
        }),
      ),
    );
    return {
      query,
      selector: ranked.selector,
      matches: ranked.matches.slice(0, limit),
      matched: ranked.matches.length,
      ...(ranked.fallback !== undefined && { fallback: ranked.fallback }),
    };
  }).pipe(Effect.withSpan("discovery.selectTools"));
