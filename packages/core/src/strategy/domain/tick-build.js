// @ts-check

/**
 * @param {{
 *   readonly tickId: string;
 *   readonly strategyId: string;
 *   readonly dueAt: number;
 *   readonly startedAt: number;
 *   readonly finishedAt: number | null;
 *   readonly outcome: import("./tick.js").TickOutcome;
 *   readonly observations: Readonly<Record<string, string | number>>;
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly intents: ReadonlyArray<import("./tick.js").TickIntent>;
 *   readonly note?: string;
 *   readonly reason?: string;
 *   readonly remedy?: string;
 *   readonly step?: number;
 * }} input
 * @returns {import("./tick.js").Tick}
 */
export const buildTick = (input) => ({
  tickId: input.tickId,
  strategyId: input.strategyId,
  dueAt: input.dueAt,
  startedAt: input.startedAt,
  finishedAt: input.finishedAt,
  outcome: input.outcome,
  observations: { ...input.observations },
  actions: [...input.actions],
  intents: [...input.intents],
  ...(input.note !== undefined ? { note: input.note } : {}),
  ...(input.reason !== undefined ? { reason: input.reason } : {}),
  ...(input.remedy !== undefined ? { remedy: input.remedy } : {}),
  ...(input.step !== undefined ? { step: input.step } : {}),
});
