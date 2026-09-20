// @ts-check
import { z } from "zod";
import { StationCheckpointSchema } from "./schema.js";

const FailureSchema = z.object({
  at: z.iso.datetime(),
  code: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  status: z.enum(["failed", "cancelled"]),
});

export const RuntimeProgressSchema = z.object({
  failures: z.array(FailureSchema).max(20),
  latestOperation: StationCheckpointSchema.shape.latestOperation,
  verification: StationCheckpointSchema.shape.verification.optional(),
  verificationAt: z.iso.datetime().optional(),
});

const OPERATION_STATUS = /** @type {const} */ ({
  completed: "passed",
  failed: "failed",
  rejected: "cancelled",
});

/** @param {string} name */
const isVerification = (name) => /check|evidence|lint|test|typecheck|verif/iu.test(name);

/** @param {"passed" | "failed" | "cancelled"} status */
const verificationStatus = (status) => (status === "passed" ? "passed" : "failed");

/** @param {Extract<import("eve/hooks").HookEvent, {type: "action.result"}>} event */
const actionProgress = (event) => {
  if (event.data.result.kind !== "tool-result") return undefined;
  const name = event.data.result.toolName.slice(0, 200);
  const status = OPERATION_STATUS[event.data.status];
  return {
    code: (event.data.error?.code ?? `ACTION_${event.data.status.toUpperCase()}`).slice(0, 200),
    latestOperation: { at: event.meta.at, name, status },
    verification: isVerification(name),
  };
};

/** @param {Extract<import("eve/hooks").HookEvent, {type: "step.failed"}>} event */
const stepProgress = (event) => ({
  code: event.data.code.slice(0, 200),
  latestOperation: {
    at: event.meta.at,
    name: `model step ${event.data.stepIndex}`,
    status: /** @type {const} */ ("failed"),
  },
  verification: false,
});

/** @param {import("eve/hooks").HookEvent} event */
export const progressFromEvent = (event) => {
  if (event.type === "action.result") return actionProgress(event);
  if (event.type === "step.failed") return stepProgress(event);
  return undefined;
};

/** @param {import("./runtime-observation.js").RuntimeProgress | undefined} prior @param {NonNullable<ReturnType<typeof progressFromEvent>> | undefined} fact */
export const mergeRuntimeProgress = (prior, fact) => {
  if (fact === undefined) return prior;
  const operation = fact.latestOperation;
  const failures = updatedFailures(prior, fact);
  return RuntimeProgressSchema.parse({
    failures: failures.slice(-20),
    latestOperation: operation,
    verification: fact.verification
      ? { stage: operation.name, status: verificationStatus(operation.status) }
      : prior?.verification,
    verificationAt: fact.verification ? operation.at : prior?.verificationAt,
  });
};

/** @param {import("./runtime-observation.js").RuntimeProgress | undefined} prior @param {NonNullable<ReturnType<typeof progressFromEvent>>} fact */
const updatedFailures = (prior, fact) => {
  const operation = fact.latestOperation;
  const failures = (prior?.failures ?? []).filter((failure) => failure.name !== operation.name);
  if (operation.status === "passed") return failures;
  return [
    ...failures,
    { at: operation.at, code: fact.code, name: operation.name, status: operation.status },
  ];
};
