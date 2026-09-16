// @ts-check
/** @typedef {import("eve/client").MessageStreamEvent} MessageStreamEvent */

/**
 * Every write tool the `github` extension mounts, namespaced as the model sees them. Read-only
 * evals assert `notCalledTool` over this whole list, so a new write tool added to the extension is
 * forbidden in every read-only eval until someone allows it deliberately. Keep in sync with the
 * `include` list in `agent/extensions/github.js`.
 */
export const GITHUB_WRITE_TOOLS = Object.freeze([
  "github__addAssignees",
  "github__addIssueComment",
  "github__addLabels",
  "github__addPullRequestComment",
  "github__closeIssue",
  "github__createIssue",
  "github__createPullRequest",
  "github__removeAssignees",
  "github__removeLabel",
  "github__requestReviewers",
  "github__updateIssue",
  "github__updatePullRequest",
]);

/**
 * Root-mounted write tools (not part of the extension). `read-factory-brain` and `read-artifact`
 * are deliberately absent: reading is always allowed.
 */
export const ROOT_WRITE_TOOLS = Object.freeze(["update-factory-brain"]);

/** Every write tool the model can reach, extension and root alike. */
export const WRITE_TOOLS = Object.freeze([...GITHUB_WRITE_TOOLS, ...ROOT_WRITE_TOOLS]);

/** The four factory stations, in pipeline order. */
export const STATIONS = Object.freeze(["classifier", "analyst", "implementer", "reviewer"]);

/**
 * The order in which subagents were first delegated to during a run. Station delegations are
 * subagent calls, not tool calls, so ordering assertions walk `subagent.called` events.
 * @param {readonly MessageStreamEvent[]} events
 * @returns {string[]}
 */
export const subagentCallOrder = (events) => {
  /** @type {string[]} */
  const order = [];
  for (const event of events) {
    if (event.type === "subagent.called" && !order.includes(event.data.name))
      order.push(event.data.name);
  }
  return order;
};

/**
 * True when every named subagent was called and their first calls happened in the given order
 * (other calls may interleave).
 * @param {readonly MessageStreamEvent[]} events
 * @param {readonly string[]} names
 */
export const calledInOrder = (events, names) => {
  const order = subagentCallOrder(events);
  const indices = names.map((name) => order.indexOf(name));
  return indices.every((index, i) => index !== -1 && (i === 0 || index > (indices[i - 1] ?? -1)));
};

/**
 * Tool-call names in the order they were requested.
 * @param {readonly MessageStreamEvent[]} events
 * @returns {string[]}
 */
export const toolCallOrder = (events) => {
  /** @type {string[]} */
  const order = [];
  for (const event of events) {
    if (event.type !== "actions.requested") continue;
    for (const action of event.data.actions) {
      if (action.kind === "tool-call") order.push(action.toolName);
    }
  }
  return order;
};
