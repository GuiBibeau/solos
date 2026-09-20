// @ts-check
import { z } from "zod";
import { readDocument, writeDocument } from "../blob.js";
import { dispatchAuthorizationKey } from "./config.js";
import { StationSchema } from "./schema.js";

const IdentitySchema = z.object({
  rootRunId: z.string().min(1).max(200),
  station: StationSchema,
  taskId: z.string().regex(/^task_[a-f\d]{24}$/),
  workItem: z.string().min(1).max(200),
});
const AuthorizationSchema = IdentitySchema.extend({
  stationRunId: z.string().min(1).max(200).optional(),
  status: z.enum(["pending", "claimed"]),
  turnId: z.string().min(1).max(200).optional(),
});

/** @param {unknown} left @param {unknown} right */
const isSame = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** @param {AuthorizationIo} io @param {z.infer<typeof IdentitySchema>} identity */
const authorize = async (io, identity) => {
  const parsed = IdentitySchema.parse(identity);
  const key = dispatchAuthorizationKey(parsed.taskId);
  if (key === null) throw new Error("Invalid dispatch authorization identity.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await io.read(key);
    if (stored.found) {
      const current = AuthorizationSchema.parse(JSON.parse(stored.content));
      if (!isSame(IdentitySchema.parse(current), parsed))
        throw new Error("Conflicting dispatch authorization.");
      return;
    }
    try {
      await io.write(key, JSON.stringify({ ...parsed, status: "pending" }), {
        allowOverwrite: false,
        contentType: "application/json",
      });
      return;
    } catch {
      // Retry after a concurrent or response-lost write.
    }
  }
  throw new Error("Dispatch authorization could not be persisted.");
};

/** @param {AuthorizationIo} io @param {z.infer<typeof IdentitySchema> & {stationRunId: string; turnId: string}} claim */
const claim = async (io, claim) => {
  const identity = IdentitySchema.parse(claim);
  const key = dispatchAuthorizationKey(identity.taskId);
  if (key === null) throw new Error("Invalid dispatch authorization identity.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await io.read(key);
    if (!stored.found) throw new Error("Unauthorized station dispatch.");
    const current = AuthorizationSchema.parse(JSON.parse(stored.content));
    if (!isSame(IdentitySchema.parse(current), identity))
      throw new Error("Unauthorized station dispatch.");
    const next = AuthorizationSchema.parse({
      ...identity,
      stationRunId: claim.stationRunId,
      status: "claimed",
      turnId: claim.turnId,
    });
    if (current.status === "claimed") {
      if (!isSame(current, next)) throw new Error("Dispatch authorization already claimed.");
      return;
    }
    try {
      await io.write(key, JSON.stringify(next), {
        allowOverwrite: true,
        contentType: "application/json",
        ifMatch: stored.etag,
      });
      return;
    } catch {
      // Retry the compare-and-set against fresh durable state.
    }
  }
  throw new Error("Dispatch authorization could not be claimed.");
};

/** @param {AuthorizationIo} io */
export const createDispatchAuthorizationStore = (io) => ({
  authorize: (/** @type {DispatchIdentity} */ identity) => authorize(io, identity),
  claim: (/** @type {DispatchIdentity & {stationRunId: string; turnId: string}} */ identity) =>
    claim(io, identity),
});

export const dispatchAuthorizationStore = createDispatchAuthorizationStore({
  read: readDocument,
  write: writeDocument,
});

/** @typedef {{read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true}>; write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>}} AuthorizationIo */
/** @typedef {z.infer<typeof IdentitySchema>} DispatchIdentity */
