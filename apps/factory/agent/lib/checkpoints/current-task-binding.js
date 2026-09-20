// @ts-check
import { z } from "zod";
import { currentTaskKey } from "./config.js";
import { StationSchema } from "./schema.js";

export const CurrentTaskBindingSchema = z.object({
  eventId: z.string().min(1).max(200),
  receivedAt: z.iso.datetime(),
  rootRunId: z.string().min(1).max(200),
  station: StationSchema,
  stationRunId: z.string().min(1).max(200),
  taskId: z.string().regex(/^task_[a-f\d]{24}$/),
  turnId: z.string().min(1).max(200),
  workItem: z.string().min(1).max(200),
});

/** @param {TaskBindingIo} io @param {string} key @param {z.infer<typeof CurrentTaskBindingSchema>} incoming */
const save = async (io, key, incoming) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await io.read(key);
    const current = stored.found
      ? CurrentTaskBindingSchema.parse(JSON.parse(stored.content))
      : undefined;
    if (current !== undefined && current.eventId >= incoming.eventId) return;
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
export const createCurrentTaskBindingStore = (io) => ({
  read: async (/** @type {{rootRunId: string; station: string; workItem: string}} */ identity) => {
    const key = currentTaskKey(identity.workItem, identity.rootRunId, identity.station);
    if (key === null) return { found: /** @type {const} */ (false) };
    const stored = await io.read(key);
    return stored.found
      ? {
          binding: CurrentTaskBindingSchema.parse(JSON.parse(stored.content)),
          found: /** @type {const} */ (true),
        }
      : { found: /** @type {const} */ (false) };
  },
  save: async (/** @type {unknown} */ candidate) => {
    const binding = CurrentTaskBindingSchema.parse(candidate);
    const key = currentTaskKey(binding.workItem, binding.rootRunId, binding.station);
    if (key === null) throw new Error("Invalid current task binding identity.");
    await save(io, key, binding);
  },
});

/** @typedef {{read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true}>; write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>}} TaskBindingIo */
