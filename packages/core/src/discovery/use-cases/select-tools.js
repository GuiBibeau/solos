// @ts-check
import { Duration, Effect } from "effect";
import { ToolSelectorUnavailable } from "../domain/errors.js";
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
 * Rank the given tools against one free-text request. Selection never fails: when the
 * configured selector cannot answer, the local matcher does, and `fallback` says why.
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
