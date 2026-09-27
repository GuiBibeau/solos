// @ts-check
import { IrisConfigMissing, IrisNetworkError, IrisResponseInvalid, IrisTimeout } from "@solos/core";
import { Effect } from "effect";
import { DEFAULT_TIMEOUT_MS, isDeadlineAbort } from "./elfa-api.js";
import { parseJson, statusError } from "./elfa-errors.js";

/** @typedef {{ baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: import("./elfa-api.js").Fetch }} ElfaReadConfig */
/** @typedef {{ path: string; query: Record<string, string | number | undefined> }} ReadRequest */

/** @param {ElfaReadConfig & { apiKey: string }} config @param {ReadRequest} request */
const requestElfa = async (config, request) => {
  const url = new URL(request.path, config.baseUrl);
  for (const [key, value] of Object.entries(request.query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await (config.fetchImpl ?? fetch)(url.href, {
    headers: { "x-elfa-api-key": config.apiKey },
    signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  return {
    status: response.status,
    body: await response.text(),
    credits: readCredits(response.headers.get("x-elfa-credits")),
  };
};

/** No invented zero when the provider omits its billing header. @param {string | null} value */
const readCredits = (value) => {
  if (value === null || !/^\d+(\.\d+)?$/.test(value)) return null;
  const credits = Number(value);
  return Number.isFinite(credits) ? credits : null;
};

/** @template T @param {Awaited<ReturnType<typeof requestElfa>>} outcome @param {import("zod").ZodType<T>} schema */
const decode = (outcome, schema) => {
  const error = statusError(outcome.status);
  if (error) return Effect.fail(error);
  const parsed = schema.safeParse(parseJson(outcome.body));
  if (!parsed.success)
    return Effect.fail(
      new IrisResponseInvalid({
        status: outcome.status,
        reason: "Elfa market response did not match the documented envelope",
      }),
    );
  return Effect.succeed({
    ...parsed.data,
    provider: /** @type {const} */ ("elfa"),
    creditsConsumed: outcome.credits,
    receivedAt: Date.now(),
  });
};

/** One attempt; never retries credit-consuming requests or returns upstream error bodies.
 * @template T @param {ElfaReadConfig} config @param {ReadRequest} request @param {import("zod").ZodType<T>} schema
 */
export const readElfa = (config, request, schema) => {
  const { apiKey } = config;
  if (!apiKey?.trim())
    return Effect.fail(
      new IrisConfigMissing({
        reason: "ELFA_API_KEY is not set; export it to use Elfa",
        remedy:
          "set ELFA_API_KEY to a key from your Elfa account (https://www.elfa.ai); chat access " +
          "needs a Grow plan or above",
      }),
    );
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Effect.tryPromise({
    try: () => requestElfa({ ...config, apiKey }, request),
    catch: (error) =>
      isDeadlineAbort(error)
        ? new IrisTimeout({ timeoutMs })
        : new IrisNetworkError({ reason: "Elfa market request failed" }),
  }).pipe(Effect.flatMap((outcome) => decode(outcome, schema)));
};
