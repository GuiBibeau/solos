// @ts-check
import {
  IrisAuthFailed,
  IrisConfigMissing,
  IrisHttpError,
  IrisNetworkError,
  IrisRateLimited,
  IrisResponseInvalid,
  IrisTimeout,
  MarketIntelligence,
} from "@solos/core";
import { Effect, Layer } from "effect";
import { z } from "zod";
import { DEFAULT_TIMEOUT_MS, elfaChat, isDeadlineAbort } from "./elfa-api.js";

/**
 * Documented success envelope, parsed in strip mode so provider extensions never break us.
 * Only these fields are read; nothing else escapes the adapter.
 */
const EnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().min(1),
    sessionId: z.string(),
    creditsConsumed: z.number().min(0),
  }),
});

/**
 * @param {number} status
 * @returns {import("@solos/core").IrisError | undefined}
 */
const statusError = (status) => {
  if (status === 401 || status === 403) return new IrisAuthFailed({ status });
  if (status === 429) return new IrisRateLimited({ status });
  if (status < 200 || status >= 300)
    return new IrisHttpError({ status, reason: `elfa chat answered with HTTP ${status}` });
  return undefined;
};

/**
 * Translate one outcome into the answer or a slice-owned error. Raw bodies and the API key
 * never become error props; only the HTTP status and a short fixed reason travel.
 * @param {import("./elfa-api.js").ElfaChatOutcome} outcome
 */
const fromOutcome = (outcome) => {
  const failed = statusError(outcome.status);
  if (failed) return Effect.fail(failed);
  const parsed = EnvelopeSchema.safeParse(parseJson(outcome.body));
  if (!parsed.success) {
    return Effect.fail(
      new IrisResponseInvalid({
        status: outcome.status,
        reason: "elfa chat response did not match the documented envelope",
      }),
    );
  }
  return Effect.succeed({
    provider: /** @type {const} */ ("elfa"),
    answer: parsed.data.data.message,
    creditsConsumed: parsed.data.data.creditsConsumed,
    receivedAt: Date.now(),
  });
};

/** @param {string} body @returns {unknown} */
const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/**
 * Live market intelligence over the Elfa chat HTTP API. The key is optional at wiring time
 * and required only when a question is actually asked; missing config fails pre-HTTP.
 * @param {{ baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: import("./elfa-api.js").Fetch }} config
 */
export const MarketIntelligenceLive = (config) =>
  Layer.effect(
    MarketIntelligence,
    Effect.succeed({
      ask: (question) => {
        const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const { apiKey } = config;
        if (!apiKey) {
          return Effect.fail(
            new IrisConfigMissing({ reason: "ELFA_API_KEY is not set; export it to use Iris" }),
          );
        }
        return Effect.tryPromise({
          try: () =>
            elfaChat(
              { baseUrl: config.baseUrl, apiKey, timeoutMs, fetchImpl: config.fetchImpl },
              question,
            ),
          catch: (error) =>
            isDeadlineAbort(error)
              ? new IrisTimeout({ timeoutMs })
              : new IrisNetworkError({ reason: "elfa chat request failed" }),
        }).pipe(Effect.flatMap(fromOutcome));
      },
    }),
  );
