// @ts-check

/**
 * The newest Tick that already carries trigger state. A later missed Tick with an empty body
 * does not erase the trailing reference or the last fire.
 * @param {ReadonlyArray<{ readonly state?: unknown }>} ticks
 */
export const latestPersistedState = (ticks) => {
  for (const tick of ticks) {
    if (tick.state !== undefined) return tick.state;
  }
  return undefined;
};
