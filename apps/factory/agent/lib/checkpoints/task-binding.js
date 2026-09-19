// @ts-check
import { createHash } from "node:crypto";
import { z } from "zod";
import { readDocument, writeDocument } from "../blob.js";
import { taskBindingKey } from "./config.js";

const BindingSchema = z.object({
  eventId: z.string().min(1).max(200),
  parentSequence: z.number().int().nonnegative(),
  parentSessionId: z.string().min(1).max(200),
  parentTurnId: z.string().min(1).max(200),
  stationRunId: z.string().min(1).max(200),
  taskId: z.string().regex(/^task_[a-f\d]{24}$/),
});

/** @param {string} parentSessionId @param {string} parentTurnId @param {string} callId */
const deriveTaskId = (parentSessionId, parentTurnId, callId) => {
  const material = `${parentSessionId}\0${parentTurnId}\0${callId}`;
  return `task_${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
};

/** @param {import("eve/hooks").HookEvent} event */
const bindingFromEvent = (event) => {
  if (event.type !== "subagent.called") return null;
  const data = event.data;
  return BindingSchema.parse({
    eventId: event.meta.id,
    parentSequence: data.sequence,
    parentSessionId: data.sessionId,
    parentTurnId: data.turnId,
    stationRunId: data.childSessionId,
    taskId: deriveTaskId(data.sessionId, data.turnId, data.callId),
  });
};

/** @param {z.infer<typeof BindingSchema> | undefined} current @param {z.infer<typeof BindingSchema>} incoming */
const alreadyRecorded = (current, incoming) => {
  if (current === undefined || current.parentSequence < incoming.parentSequence) return false;
  if (current.parentSequence === incoming.parentSequence && current.taskId !== incoming.taskId)
    throw new Error("Conflicting station task binding.");
  return true;
};

/** @param {TaskBindingIo} io @param {z.infer<typeof BindingSchema>} incoming */
const persist = async (io, incoming) => {
  const key = taskBindingKey(incoming.stationRunId);
  if (key === null) throw new Error("Invalid station run id.");
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await io.read(key);
    const current = stored.found ? BindingSchema.parse(JSON.parse(stored.content)) : undefined;
    if (alreadyRecorded(current, incoming)) return;
    try {
      await io.write(key, JSON.stringify(incoming), {
        allowOverwrite: stored.found,
        contentType: "application/json",
        ...(stored.found && { ifMatch: stored.etag }),
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

/** @param {TaskBindingIo} io */
export const createTaskBindingStore = (io) => ({
  observe: async (/** @type {import("eve/hooks").HookEvent} */ event) => {
    const binding = bindingFromEvent(event);
    if (binding !== null) await persist(io, binding);
  },
  read: async (/** @type {string} */ stationRunId) => {
    const key = taskBindingKey(stationRunId);
    if (key === null) return { found: /** @type {const} */ (false) };
    const stored = await io.read(key);
    return stored.found
      ? {
          binding: BindingSchema.parse(JSON.parse(stored.content)),
          found: /** @type {const} */ (true),
        }
      : { found: /** @type {const} */ (false) };
  },
});

export const taskBindingStore = createTaskBindingStore({
  read: readDocument,
  write: writeDocument,
});

/** @typedef {{read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true}>; write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>}} TaskBindingIo */
