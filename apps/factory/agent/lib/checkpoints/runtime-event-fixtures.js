// @ts-check

/** @param {import("eve/hooks").HookEvent["type"]} type @param {number} sequence @param {Record<string, unknown>} [data] */
export const runtimeEvent = (type, sequence, data = {}) =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data,
    meta: {
      at: `2026-09-19T00:00:${String(sequence).padStart(2, "0")}.000Z`,
      id: `event-${String(sequence).padStart(4, "0")}`,
    },
    type,
  });

export const waitingEvent = (sequence = 3) =>
  runtimeEvent("session.waiting", sequence, {
    continuationToken: "resume-here",
    wait: "next-user-message",
  });

export const sessionLimitRequest = () => ({
  action: {
    callId: "limit-1",
    input: {},
    kind: "tool-call",
    toolName: "session_limit_continuation",
  },
  allowFreeform: false,
  display: "confirmation",
  kind: "session-limit",
  prompt: "Continue?",
  requestId: "limit-1",
});
