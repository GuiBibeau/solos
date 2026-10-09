// @ts-check
/**
 * The sentences a search result carries so a Caller can act without guessing (ADR-0029): when
 * more matched than were listed, when nothing matched and what solOS does cover, when names
 * were not tools, when matches exist above this server's tier ceiling, and when matches are
 * experimental tools this server has not enabled. The wording is fixed; only counts, registry
 * group names and the tier to ask for vary.
 */
import { highestTier } from "./catalogue.js";

/** @param {number} n @param {string} noun */
const count = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * @typedef {{
 *   readonly mode: "query" | "group" | "names";
 *   readonly listed: number;
 *   readonly matched: number;
 *   readonly unknown: number;
 *   readonly groups: ReadonlyArray<string>;
 *   readonly ceiling: import("./types.js").CatalogueTier;
 *   readonly unavailable: ReadonlyArray<import("./types.js").CatalogueTier>;
 *   readonly experimental: number;
 * }} SearchFacts `unavailable` holds the tiers of the matches above the ceiling; `experimental`
 *   counts the matches within it that are withheld as experimental.
 */

/** @param {SearchFacts} facts */
const ceilingNote = (facts) =>
  facts.unavailable.length === 0
    ? null
    : `${count(facts.unavailable.length, "matching tool")} ${facts.unavailable.length === 1 ? "exists" : "exist"} above this server's tier ceiling (${facts.ceiling}) and cannot be called here. Ask the Operator to start the server with --tier ${highestTier(facts.unavailable)}.`;

/** @param {SearchFacts} facts */
const experimentalNote = (facts) =>
  facts.experimental === 0
    ? null
    : `${count(facts.experimental, "matching tool")} ${facts.experimental === 1 ? "is" : "are"} experimental and not enabled on this server. Ask the Operator to start the server with --features experimental.`;

/** @param {SearchFacts} facts */
const nothingMatched = (facts) =>
  facts.mode === "names"
    ? "None of the names given is a tool. Names are solana_<group>_<verb>_<object>; search by query or group instead."
    : `No tool covers this request. solOS covers these groups: ${facts.groups.join(", ")}.`;

/**
 * @param {SearchFacts} facts
 * @returns {string[]}
 */
export const searchNotes = (facts) => {
  const notes = [];
  if (facts.matched > facts.listed) {
    notes.push(
      `Listed ${facts.listed} of ${count(facts.matched, "matching tool")}. Raise limit or narrow the request to see the rest.`,
    );
  }
  if (facts.matched === 0) notes.push(nothingMatched(facts));
  if (facts.unknown > 0 && facts.matched > 0) {
    const verb = facts.unknown === 1 ? "is not a tool" : "are not tools";
    notes.push(`${facts.unknown} of the names given ${verb}; see unknown.`);
  }
  for (const note of [ceilingNote(facts), experimentalNote(facts)]) {
    if (note !== null) notes.push(note);
  }
  return notes;
};
