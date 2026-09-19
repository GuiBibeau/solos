// @ts-check
import { createHash } from "node:crypto";

/** @param {import("eve/tools").SessionContext} ctx */
export const runtimeTaskId = (ctx) => {
  const parent = ctx.session.parent;
  if (parent === undefined) return null;
  const material = `${parent.sessionId}\0${parent.turn.id}\0${parent.callId}`;
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 24);
  return `task_${digest}`;
};
