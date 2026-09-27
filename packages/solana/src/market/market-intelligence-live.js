// @ts-check
import {
  IrisConfigMissing,
  IrisNetworkError,
  IrisResponseInvalid,
  IrisTimeout,
  MarketIntelligence,
} from "@solos/core";
import { Effect, Layer } from "effect";
import { z } from "zod";
import { DEFAULT_TIMEOUT_MS, elfaChat, isDeadlineAbort } from "./elfa-api.js";
import { discoveryAdapter } from "./elfa-discovery.js";
import { parseJson, statusError } from "./elfa-errors.js";

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

/**
 * Live market intelligence over the Elfa chat HTTP API. The key is optional at wiring time
 * and required only when a question is actually asked; missing config fails pre-HTTP.
 * @param {{ baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: import("./elfa-api.js").Fetch }} config
 */
export const MarketIntelligenceLive = (config) =>
  Layer.effect(
    MarketIntelligence,
    Effect.succeed({
      ...discoveryAdapter(config),
      ask: (question) => {
        const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const { apiKey } = config;
        if (!apiKey) {
          return Effect.fail(
            new IrisConfigMissing({
              reason: "ELFA_API_KEY is not set; export it to use Iris",
              remedy:
                "set ELFA_API_KEY to a key from your Elfa account (https://www.elfa.ai); chat " +
                "access needs a Grow plan or above",
            }),
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
