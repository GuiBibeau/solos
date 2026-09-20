// @ts-check

/** @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint */

/** @param {import("eve/hooks").HookEvent} event */
const noPriorProgress = (event) => ({
  artifactIds: [],
  diagnostics: ["No completed station operation preceded the session-limit guardrail."],
  latestOperation: {
    at: event.meta.at,
    name: "session-limit guardrail request",
    status: /** @type {const} */ ("passed"),
  },
  nextMilestone:
    "After explicit continuation approval, inspect the preserved checkout before the first station operation.",
  verification: {
    stage: "no-verification-before-guardrail",
    status: /** @type {const} */ ("not_started"),
  },
});

/** @param {import("./runtime-observation.js").RuntimeProgress} progress */
const progressDiagnostics = (progress) =>
  progress.failures.map(
    (failure) =>
      `${failure.name} ${failure.status} (${failure.code})${failure.detail === undefined ? "" : `: ${failure.detail}`} at ${failure.at}`,
  );

/** @param {import("./schema.js").StationCheckpoint["latestOperation"]} operation */
const nextMilestone = (operation) =>
  operation.status === "passed"
    ? `Continue from completed ${operation.name} on the preserved checkout.`
    : `Correct ${operation.name}, then rerun it on the preserved checkout.`;

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeProgress} progress */
const verification = (previous, progress) => {
  const isRuntimeNewer =
    progress.verificationAt !== undefined &&
    (previous === undefined || progress.verificationAt > previous.updatedAt);
  if (isRuntimeNewer && progress.verification !== undefined) return progress.verification;
  return (
    previous?.verification ?? {
      stage: "no-verification-before-guardrail",
      status: /** @type {const} */ ("not_started"),
    }
  );
};

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeProgress} progress @param {ReturnType<typeof noPriorProgress>} fallback */
const selectedOperation = (previous, progress, fallback) => {
  const runtimeOperation = progress.latestOperation;
  const isRuntimeNewer =
    runtimeOperation !== undefined &&
    (previous === undefined || runtimeOperation.at > previous.updatedAt);
  return {
    isRuntimeNewer,
    operation: isRuntimeNewer
      ? runtimeOperation
      : (previous?.latestOperation ?? fallback.latestOperation),
  };
};

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeProgress} progress @param {ReturnType<typeof noPriorProgress>} fallback */
const currentProgress = (previous, progress, fallback) => {
  const selected = selectedOperation(previous, progress, fallback);
  return {
    artifactIds: [...new Set([...(previous?.artifactIds ?? []), ...progress.artifactIds])].slice(
      -20,
    ),
    diagnostics: [
      ...new Set([...(previous?.diagnostics ?? []), ...progressDiagnostics(progress)]),
    ].slice(-20),
    latestOperation: selected.operation,
    nextMilestone: selected.isRuntimeNewer
      ? nextMilestone(selected.operation)
      : (previous?.nextMilestone ?? fallback.nextMilestone),
    verification: verification(previous, progress),
  };
};

/** @param {StationCheckpoint} previous */
const priorProgress = (previous) => ({
  artifactIds: previous.artifactIds,
  diagnostics: previous.diagnostics,
  latestOperation: previous.latestOperation,
  nextMilestone: previous.nextMilestone,
  verification: previous.verification,
});

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeProgress | undefined} runtime */
const hasNewRuntimeProgress = (previous, runtime) => {
  if (runtime === undefined) return false;
  if (previous === undefined) return true;
  const updatedAt = runtime.updatedAt ?? runtime.latestOperation?.at;
  return updatedAt !== undefined && updatedAt > previous.updatedAt;
};

/** @param {StationCheckpoint | undefined} previous @param {import("eve/hooks").HookEvent} event @param {import("./runtime-observation.js").RuntimeObservation | undefined} observation */
export const prePauseProgress = (previous, event, observation) => {
  const runtime = observation?.progress;
  if (runtime !== undefined && hasNewRuntimeProgress(previous, runtime))
    return currentProgress(previous, runtime, noPriorProgress(event));
  if (previous === undefined) return noPriorProgress(event);
  return priorProgress(previous);
};
