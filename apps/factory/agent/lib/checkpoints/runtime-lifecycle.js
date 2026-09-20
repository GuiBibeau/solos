// @ts-check

const OUTCOMES = /** @type {const} */ ({
  "session.completed": "completed",
  "session.failed": "failed",
  "session.waiting": undefined,
  "step.failed": "failed",
  "turn.cancelled": "cancelled",
  "turn.completed": "completed",
  "turn.failed": "failed",
});

/** @param {Extract<import("eve/hooks").HookEvent, {type: "input.requested"}>} event */
const requestedInput = (event) =>
  event.data.requests.some((request) => request.kind === "session-limit")
    ? /** @type {const} */ ("session_limit")
    : /** @type {const} */ ("other");

/** @param {Extract<import("eve/hooks").HookEvent, {type: "input.resolved"}>} event */
const budgetResolution = (event) =>
  event.data.resolutions.find((resolution) => resolution.kind === "session-limit");

/** @param {Extract<import("eve/hooks").HookEvent, {type: "input.resolved"}>} event */
const budgetDecision = (event) => {
  const resolution = budgetResolution(event);
  if (resolution === undefined) return "not_budget";
  return resolution.response?.optionId === "continue" ? "continue" : "paused";
};

/** @param {import("eve/hooks").HookEvent} event */
const taskOutcome = (event) => {
  if (event.type === "input.requested")
    return requestedInput(event) === "session_limit" ? "budget_paused" : "active";
  if (event.type === "input.resolved")
    return budgetDecision(event) === "paused" ? "budget_paused" : "active";
  const outcome = OUTCOMES[/** @type {keyof typeof OUTCOMES} */ (event.type)];
  if (outcome !== undefined || event.type === "session.waiting") return outcome;
  return "active";
};

/** @param {import("eve/hooks").HookEvent} event */
const sessionStatus = (event) => {
  if (event.type === "session.completed") return "completed";
  if (["session.failed", "turn.failed", "step.failed"].includes(event.type)) return "failed";
  if (["input.requested", "session.waiting", "turn.cancelled"].includes(event.type))
    return "waiting";
  return "running";
};

/** @param {import("eve/hooks").HookEvent} event */
export const lifecycleDelta = (event) => ({
  clearPendingInput: event.type === "input.resolved" && budgetDecision(event) !== "paused",
  eventType: event.type,
  ...(event.type === "input.requested" && {
    pendingInput: requestedInput(event),
  }),
  sessionStatus: sessionStatus(event),
  taskOutcome: taskOutcome(event),
});

/** @param {RuntimeState} prior @param {ReturnType<typeof lifecycleDelta>} event */
const nextPendingInput = (prior, event) => {
  if (event.clearPendingInput) return undefined;
  return event.pendingInput ?? prior.pendingInput;
};

/** @param {RuntimeState} prior @param {ReturnType<typeof lifecycleDelta>} event @param {RuntimeState["pendingInput"]} pendingInput */
const mergedOutcome = (prior, event, pendingInput) => {
  if (pendingInput === "session_limit") return "budget_paused";
  if (pendingInput !== undefined && event.eventType === "turn.completed") return "active";
  return event.taskOutcome ?? prior.taskOutcome;
};

/** @param {RuntimeState} prior @param {ReturnType<typeof lifecycleDelta>} event */
export const mergeLifecycle = (prior, event) => {
  const pendingInput = nextPendingInput(prior, event);
  const taskOutcome = mergedOutcome(prior, event, pendingInput);
  const isWaitingAfterTurn = pendingInput !== undefined && event.eventType === "turn.completed";
  return {
    pendingInput,
    sessionStatus: isWaitingAfterTurn ? /** @type {const} */ ("waiting") : event.sessionStatus,
    taskOutcome,
  };
};

/** @typedef {{pendingInput?: "other" | "session_limit"; taskOutcome?: "active" | "budget_paused" | "cancelled" | "completed" | "failed"}} RuntimeState */
