// @ts-check
import { z } from "zod";
import { stationDeliveryMessage } from "./station-delivery.js";

const DispatchId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9._:/#-]+$/)
  .refine((value) => !value.includes(".."), "Invalid dispatch id");

export const StationDispatchInput = z.object({
  agentId: z.string().min(1).max(200).optional(),
  message: z.string().min(1),
  rootRunId: DispatchId,
  workItem: DispatchId,
});

/** @param {{input: z.infer<typeof StationDispatchInput>; station: string}} details @param {{ctx: import("eve/tools").WorkflowToolContext; task: import("eve/tools").TaskExec}} runtime */
export const bindAndDispatchStation = async ({ input, station }, { ctx, task }) => {
  const identity = {
    rootRunId: input.rootRunId,
    station,
    taskId: task.taskId,
    workItem: input.workItem,
  };
  return ctx.agent(station, {
    ...(input.agentId !== undefined && { agentId: input.agentId }),
    message: stationDeliveryMessage(identity, input.message),
  });
};
