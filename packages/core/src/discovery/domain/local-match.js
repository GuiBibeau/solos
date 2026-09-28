// @ts-check
/**
 * The local deterministic matcher: free text against every tool's name, group, title and
 * description, with no network and no key. It is the ToolSelector's fallback and its test seam.
 *
 * A request word counts once per tool, at the weight of the strongest field it appears in: name
 * or group 3, title 2, description 1. A tool's score is that sum over the most it could be, so
 * a request whose every word is in the tool's name scores 1. Ties order by name.
 */

/** Words a request carries that say nothing about which tool it wants. */
const FILLER = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "get",
  "how",
  "i",
  "in",
  "is",
  "it",
  "many",
  "me",
  "much",
  "my",
  "of",
  "on",
  "or",
  "please",
  "s",
  "some",
  "that",
  "the",
  "this",
  "to",
  "want",
  "what",
  "with",
]);

/** Every tool name starts `solana_`, so that word tells tools apart no better than silence. */
const NAME_PREFIX = "solana_";

const WEIGHT = { name: 3, title: 2, description: 1 };

/**
 * One spelling per word: lower case, and a plural `s` dropped (balances → balance, tokens →
 * token) unless the word ends `ss`, `us` or `is`.
 * @param {string} word
 */
const normalize = (word) =>
  word.length > 3 && word.endsWith("s") && !/[siu]s$/.test(word) ? word.slice(0, -1) : word;

/** @param {string} text */
const words = (text) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word !== "" && !FILLER.has(word))
      .map(normalize),
  );

/**
 * @param {import("./types.js").ToolSummary} tool
 * @returns {Map<string, number>} each word the tool carries, at its strongest field's weight
 */
const weightedWords = (tool) => {
  /** @type {Map<string, number>} */
  const weights = new Map();
  const fields = /** @type {const} */ ([
    [tool.description, WEIGHT.description],
    [tool.title, WEIGHT.title],
    [`${tool.name.replace(NAME_PREFIX, "")} ${tool.group}`, WEIGHT.name],
  ]);
  for (const [text, weight] of fields) {
    for (const word of words(text)) weights.set(word, Math.max(weights.get(word) ?? 0, weight));
  }
  return weights;
};

/**
 * Rank tools against one free-text request. Only tools that match at all are returned.
 * @param {string} query
 * @param {ReadonlyArray<import("./types.js").ToolSummary>} tools
 * @returns {import("./types.js").ToolMatch[]}
 */
export const localMatches = (query, tools) => {
  const wanted = [...words(query)];
  if (wanted.length === 0) return [];
  const most = WEIGHT.name * wanted.length;
  return tools
    .map((tool) => {
      const weights = weightedWords(tool);
      const total = wanted.reduce((sum, word) => sum + (weights.get(word) ?? 0), 0);
      return { name: tool.name, score: total / most };
    })
    .filter((match) => match.score > 0)
    .toSorted((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};
