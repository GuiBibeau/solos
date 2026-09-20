// @ts-check
import { inspectCheckpointInventory } from "./checkpoint-inventory.js";

/** @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint */

/** @param {import("eve/hooks").HookEvent} event */
const isBudgetPause = (event) =>
  event.type === "input.requested" &&
  event.data.requests.some((request) => request.kind === "session-limit");

/** @param {StationCheckpoint | undefined} previous @param {string} taskId */
const supersededOwners = (previous, taskId) => {
  if (previous === undefined || previous.taskId === taskId)
    return previous?.supersededTaskIds ?? [];
  return [...previous.supersededTaskIds, previous.taskId].slice(-20);
};

/** @param {StationCheckpoint | undefined} previous @param {import("eve/hooks").HookEvent} event */
const preservedProgress = (previous, event) => {
  if (previous !== undefined) {
    return {
      artifactIds: previous.artifactIds,
      diagnostics: previous.diagnostics,
      latestOperation: previous.latestOperation,
      nextMilestone: previous.nextMilestone,
      verification: previous.verification,
    };
  }
  return {
    artifactIds: [],
    diagnostics: ["Budget guardrail reached before a station milestone."],
    latestOperation: {
      at: event.meta.at,
      name: "git checkout inventory",
      status: /** @type {const} */ ("passed"),
    },
    nextMilestone:
      "Resume the preserved checkout, inspect its dirty inventory, and continue the interrupted milestone.",
    verification: {
      stage: "pre-pause-checkpoint",
      status: /** @type {const} */ ("blocked"),
    },
  };
};

/** @param {StationCheckpoint | undefined} previous */
const branchBase = (previous) => previous?.branch?.base ?? "main";

/** @param {StationCheckpoint | undefined} previous */
const blockerField = (previous) =>
  previous?.blocker === undefined ? {} : { blocker: previous.blocker };

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeObservation | undefined} observation */
const cursorField = (previous, observation) => {
  const cursor = observation?.cursor ?? previous?.cursor;
  return cursor === undefined ? {} : { cursor };
};

/** @param {import("./runtime-observation.js").RuntimeObservation | undefined} observation */
const usageField = (observation) =>
  observation?.usage === undefined ? {} : { usage: observation.usage };

/** @param {StationCheckpoint | undefined} previous */
const nextRevision = (previous) => (previous === undefined ? 1 : previous.revision + 1);

/** @param {BuildInput} input */
export const buildPrePauseCheckpoint = ({ binding, event, inventory, observation, previous }) => {
  return {
    ...preservedProgress(previous, event),
    ...blockerField(previous),
    ...cursorField(previous, observation),
    ...usageField(observation),
    branch: { ...inventory, base: branchBase(previous) },
    outcome: /** @type {const} */ ("budget_paused"),
    revision: nextRevision(previous),
    rootRunId: binding.rootRunId,
    station: binding.station,
    stationRunId: binding.stationRunId,
    supersededTaskIds: supersededOwners(previous, binding.taskId),
    taskId: binding.taskId,
    updatedAt: event.meta.at,
    workItem: binding.workItem,
  };
};

/** @param {CheckpointStore} checkpoints @param {BuildInput} input */
const persist = async (checkpoints, input) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await checkpoints.read(input.binding);
    const candidate = buildPrePauseCheckpoint({
      ...input,
      previous: stored.checkpoint,
    });
    const result = await checkpoints.save(candidate);
    if (result.saved) return;
  }
  throw new Error("Pre-pause checkpoint could not be persisted.");
};

/** @param {PrePauseDependencies} dependencies */
export const createPrePauseCheckpoint =
  ({ checkpoints, observer, bindings, inspect = inspectCheckpointInventory }) =>
  async (
    /** @type {import("eve/hooks").HookEvent} */ event,
    /** @type {import("eve/hooks").HookContext} */ ctx,
  ) => {
    if (!isBudgetPause(event) || ctx.session.parent === undefined) return;
    const ownership = await bindings.read({
      stationRunId: ctx.session.id,
      turnId: ctx.session.turn.id,
    });
    if (!ownership.found) throw new Error("Budget pause requires a runtime-bound station task.");
    const observed = await observer.read(ctx.session.id);
    const inventory = await inspect(ctx);
    await persist(checkpoints, {
      binding: ownership.binding,
      event,
      inventory,
      observation: observed.observation,
    });
  };

/** @typedef {{read: (identity: {rootRunId: string; station: string; workItem: string}) => Promise<{checkpoint?: StationCheckpoint; found: boolean}>; save: (candidate: unknown) => Promise<{saved?: boolean}>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}>}} RuntimeObserver */
/** @typedef {{read: (identity: {stationRunId: string; turnId: string}) => Promise<{found: false} | {binding: CurrentBinding; found: true}>}} TaskBindings */
/** @typedef {{dirty: boolean; dirtyFiles: string[]; head?: string; name?: string}} Inventory */
/** @typedef {{rootRunId: string; station: "analyst"|"classifier"|"implementer"|"researcher"|"reviewer"; stationRunId: string; taskId: string; workItem: string}} CurrentBinding */
/** @typedef {{binding: CurrentBinding; event: import("eve/hooks").HookEvent; inventory: Inventory; observation?: import("./runtime-observation.js").RuntimeObservation; previous?: StationCheckpoint}} BuildInput */
/** @typedef {{bindings: TaskBindings; checkpoints: CheckpointStore; inspect?: (ctx: import("eve/hooks").HookContext) => Promise<Inventory>; observer: RuntimeObserver}} PrePauseDependencies */
