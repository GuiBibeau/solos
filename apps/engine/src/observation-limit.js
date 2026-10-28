// @ts-check
import { ValidationError } from "@solos/core";
import { durationMs } from "@solos-sh/actions";

/**
 * Default is two tick intervals. A positive integer is an interval count. Any other value is
 * a duration such as `2m`.
 * @param {Record<string, string | undefined>} env
 * @returns {{ readonly intervals: number } | { readonly absoluteMs: number }}
 */
/**
 * An explicit test override wins. Otherwise the Operator's env, otherwise two intervals.
 * @param {{
 *   readonly env: Record<string, string | undefined>;
 *   readonly stalenessIntervals?: number;
 *   readonly stalenessMs?: number;
 * }} input
 */
export const stalenessOptions = (input) => {
  if (input.stalenessMs !== undefined) return { stalenessMs: input.stalenessMs };
  if (input.stalenessIntervals !== undefined)
    return { stalenessIntervals: input.stalenessIntervals };
  const parsed = stalenessFromEnv(input.env);
  if ("absoluteMs" in parsed) return { stalenessMs: parsed.absoluteMs };
  return { stalenessIntervals: parsed.intervals };
};

/** @param {Record<string, string | undefined>} env */
export const stalenessFromEnv = (env) => {
  const value = env.SOLOS_OBSERVATION_STALENESS;
  if (value === undefined || value === "") return { intervals: 2 };
  if (/^[1-9]\d*$/.test(value)) return { intervals: Number(value) };
  const ms = durationMs(value);
  if (ms !== undefined) return { absoluteMs: ms };
  throw new ValidationError({
    field: "SOLOS_OBSERVATION_STALENESS",
    value,
    reason:
      "SOLOS_OBSERVATION_STALENESS must be a duration such as 2m or an interval count such as 2",
    remedy: "unset it, set a duration such as 2m, or set an interval count such as 2",
  });
};
