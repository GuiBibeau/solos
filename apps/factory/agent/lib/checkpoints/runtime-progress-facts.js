// @ts-check

const ARTIFACT_ID = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

/** @param {unknown} value */
export const record = (value) =>
  value !== null && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : {};

/** @param {string} value */
const boundedDetail = (value) =>
  value
    .replaceAll(/https?:\/\/\S+/giu, "[redacted-url]")
    .replaceAll(/(authorization|api[_-]?key|secret|token)\s*[:=]\s*\S+/giu, "$1=[redacted]")
    .replaceAll(/[A-Za-z\d_-]{40,}/gu, "[redacted]")
    .slice(0, 500);

/** @param {Extract<import("eve/hooks").HookEvent, {type: "action.result"}>} event */
export const errorDetail = (event) => {
  const output = record(event.data.result.kind === "tool-result" ? event.data.result.output : {});
  const candidate = [event.data.error?.message, output.error, output.verifierError].find(
    (value) => typeof value === "string" && value.length > 0,
  );
  return typeof candidate === "string" ? boundedDetail(candidate) : undefined;
};

/** @param {string} name @param {Record<string, unknown>} output */
export const artifactIds = (name, output) => {
  const id = output.id;
  return typeof id === "string" &&
    name === "save-artifact" &&
    output.saved === true &&
    id.length <= 200 &&
    ARTIFACT_ID.test(id)
    ? [id]
    : [];
};

export const boundedStepDetail = boundedDetail;
