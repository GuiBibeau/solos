// @ts-check
import { z } from "zod";
import { readDocument, writeDocument } from "../blob.js";
import { taskBindingKey } from "./config.js";
import { StationSchema } from "./schema.js";
import { stationDeliveryFromMessage } from "./station-delivery.js";

const DeliveryBindingSchema = z.object({
  rootRunId: z.string().min(1).max(200),
  station: StationSchema,
  taskId: z.string().regex(/^task_[a-f\d]{24}$/),
  workItem: z.string().min(1).max(200),
});
const ActiveBindingSchema = DeliveryBindingSchema.extend({
  stationRunId: z.string().min(1).max(200),
  turnId: z.string().min(1).max(200),
});

/** @param {TaskBindingIo} io @param {{incoming: unknown; key: string; schema: z.ZodType}} details */
const persist = async (io, { incoming, key, schema }) => {
  const parsed = schema.parse(incoming);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await io.read(key);
    const current = stored.found ? schema.parse(JSON.parse(stored.content)) : undefined;
    if (current !== undefined) {
      if (JSON.stringify(current) !== JSON.stringify(parsed))
        throw new Error("Conflicting task binding.");
      return;
    }
    try {
      await io.write(key, JSON.stringify(parsed), {
        allowOverwrite: false,
        contentType: "application/json",
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
  observe: async (
    /** @type {import("eve/hooks").HookEvent} */ event,
    /** @type {import("eve/hooks").HookContext} */ ctx,
  ) => {
    if (event.type !== "message.received") return;
    const delivery = stationDeliveryFromMessage(event.data.message);
    if (delivery === null) return;
    if (event.data.turnId !== ctx.session.turn.id) throw new Error("Delivery turn mismatch.");
    if (delivery.station !== ctx.agent.name) throw new Error("Station delivery target mismatch.");
    const binding = DeliveryBindingSchema.parse(delivery);
    const key = taskBindingKey(ctx.session.id, event.data.turnId);
    if (key === null) throw new Error("Invalid active task binding identity.");
    await persist(io, {
      incoming: { ...binding, stationRunId: ctx.session.id, turnId: event.data.turnId },
      key,
      schema: ActiveBindingSchema,
    });
  },
  read: async (/** @type {{stationRunId: string; turnId: string}} */ identity) => {
    const key = taskBindingKey(identity.stationRunId, identity.turnId);
    if (key === null) return { found: /** @type {const} */ (false) };
    const stored = await io.read(key);
    return stored.found
      ? {
          binding: ActiveBindingSchema.parse(JSON.parse(stored.content)),
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
