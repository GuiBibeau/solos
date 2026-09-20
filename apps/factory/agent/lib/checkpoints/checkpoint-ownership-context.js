// @ts-check

/** @param {string} turnId */
export const stationContext = (turnId) =>
  /** @type {import("eve/tools").ToolContext} */ ({
    abortSignal: new AbortController().signal,
    callId: `save-${turnId}`,
    session: {
      id: "reused-station-session",
      parent: {
        callId: "original-creation-call",
        rootSessionId: "root-session",
        sessionId: "parent-session",
        turn: { id: "original-parent-turn", sequence: 0 },
      },
      turn: { id: turnId, sequence: 2 },
    },
    toolName: "save-station-checkpoint",
  });

/** @param {number} sequence @param {import("eve/tools").WorkflowToolContext["agent"]} onAgent */
export const workflowContext = (sequence, onAgent) =>
  /** @type {import("eve/tools").WorkflowToolContext} */ ({
    agent: onAgent,
    callId: `dispatch-${sequence}`,
    session: { id: "root-session", turn: { id: `root-turn-${sequence}`, sequence } },
    toolName: "dispatch-implementer",
  });

/** @param {string} message @param {string} turnId @param {number} sequence */
export const deliveryEvent = (message, turnId, sequence) =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data: { message, sequence, turnId },
    meta: { at: `2099-09-19T00:00:0${sequence}Z`, id: `delivery-${sequence}` },
    type: "message.received",
  });

/** @param {string} turnId */
export const hookContext = (turnId) =>
  /** @type {import("eve/hooks").HookContext} */ ({
    agent: { name: "implementer" },
    channel: {},
    session: stationContext(turnId).session,
  });
