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
const continuedBudgetRequests = (event) =>
  event.data.resolutions.length > 0 &&
  event.data.resolutions.every(
    (resolution) =>
      resolution.kind === "session-limit" &&
      resolution.outcome === "answered" &&
      resolution.response?.requestId === resolution.requestId &&
      resolution.response?.optionId === "continue",
  )
    ? event.data.resolutions.map((resolution) => resolution.requestId)
    : [];

/** @param {import("eve/hooks").HookEvent} event */
const taskOutcome = (event) => {
  if (event.type === "input.requested")
    return requestedInput(event) === "session_limit" ? "budget_paused" : "active";
  if (event.type === "input.resolved") return "active";
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
  continuedBudgetRequests: event.type === "input.resolved" ? continuedBudgetRequests(event) : [],
  eventType: event.type,
  ...(event.type === "input.requested" && {
    pendingInput: requestedInput(event),
    pendingSessionLimitRequests: event.data.requests
      .filter((request) => request.kind === "session-limit")
      .map((request) => request.requestId),
  }),
  sessionStatus: sessionStatus(event),
  taskOutcome: taskOutcome(event),
});

/** @param {RuntimeState} prior @param {ReturnType<typeof lifecycleDelta>} event */
const budgetContinued = (prior, event) => {
  const pending = prior.pendingSessionLimitRequests ?? [];
  const continued = new Set(event.continuedBudgetRequests);
  return (
    pending.length > 0 &&
    continued.size === pending.length &&
    pending.every((id) => continued.has(id))
  );
};

/** @param {RuntimeState} prior @param {ReturnType<typeof lifecycleDelta>} event */
const nextPendingInput = (prior, event) => {
  if (event.eventType === "input.resolved" && prior.pendingInput !== "session_limit")
    return undefined;
  if (event.eventType === "input.resolved" && budgetContinued(prior, event)) return undefined;
  return event.pendingInput ?? prior.pendingInput;
};

/** @param {RuntimeState} prior @param {ReturnType<typeof lifecycleDelta>} event @param {RuntimeState["pendingInput"]} pendingInput */
const pendingSessionLimitRequests = (prior, event, pendingInput) => {
  if (pendingInput !== "session_limit") return undefined;
  return event.pendingSessionLimitRequests ?? prior.pendingSessionLimitRequests;
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
  const isWaitingAfterTurn =
    pendingInput === "session_limit" ||
    (pendingInput !== undefined && event.eventType === "turn.completed");
  return {
    pendingInput,
    pendingSessionLimitRequests: pendingSessionLimitRequests(prior, event, pendingInput),
    sessionStatus: isWaitingAfterTurn ? /** @type {const} */ ("waiting") : event.sessionStatus,
    taskOutcome,
  };
};

/** @typedef {{pendingInput?: "other" | "session_limit"; pendingSessionLimitRequests?: string[]; taskOutcome?: "active" | "budget_paused" | "cancelled" | "completed" | "failed"}} RuntimeState */
