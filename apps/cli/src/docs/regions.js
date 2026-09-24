// @ts-check
/**
 * A generated region is a named block inside a hand-written document: the block belongs to the
 * registry, the prose around it belongs to a human. `solos dev docs check` compares what the
 * block holds against what the registry renders, so a new tool or slice cannot ship with the
 * documentation left behind.
 */

/** @param {string} name */
const markersFor = (name) => ({
  start: `<!-- generated: ${name} -->`,
  end: `<!-- /generated: ${name} -->`,
});

/**
 * The body between a region's markers, or null when the region is absent or unterminated. A
 * renamed or deleted marker reads as absent rather than as an empty region, so it is reported
 * instead of being silently satisfied.
 * @param {string} text
 * @param {string} name
 * @returns {string | null}
 */
export const readRegion = (text, name) => {
  const { start, end } = markersFor(name);
  const from = text.indexOf(start);
  if (from === -1) return null;
  const to = text.indexOf(end, from);
  if (to === -1) return null;
  return text.slice(from + start.length, to).trim();
};

/**
 * The same document with one region's body replaced. Absent markers throw: appending the block
 * instead would quietly duplicate content the caller believes it is updating in place.
 * @param {string} text
 * @param {string} name
 * @param {string} body
 * @returns {string}
 */
export const replaceRegion = (text, name, body) => {
  const { start, end } = markersFor(name);
  const from = text.indexOf(start);
  const to = from === -1 ? -1 : text.indexOf(end, from);
  if (to === -1) throw new Error(`no "${name}" region to write`);
  return `${text.slice(0, from)}${start}\n${body}\n${text.slice(to)}`;
};
