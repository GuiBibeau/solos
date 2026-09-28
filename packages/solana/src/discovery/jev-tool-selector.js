// @ts-check
/**
 * JEV (typesafe.ai System One) as a ToolSelector, reached through Vercel AI Gateway as the
 * evaluation model `typesafe-ai/jev`. It asks one choice question — which tool serves this
 * request — with every tool in the registry as an option, and JEV answers with a probability
 * for each option.
 *
 * Each option is described by the tool's title alone. Measured on 2026-09-28 over the 48-tool
 * registry, adding descriptions sent 7,258 input tokens instead of 1,356 per request, 5.4 times
 * the cost. JEV picked the same tool for every request tried.
 */
import { createGateway } from "@ai-sdk/gateway";
import { ToolSelector, ToolSelectorUnavailable } from "@solos/core";
import { Effect, Layer } from "effect";

export const JEV_MODEL_ID = "typesafe-ai/jev";

/**
 * By default the gateway tries a DigitalOcean-hosted JEV first. Measured on 2026-09-28, that
 * host answered 503 after about 270 ms on every call before the gateway fell back to TypeSafe's
 * own endpoint. So TypeSafe goes first, and DigitalOcean stays as the fallback.
 */
const PROVIDER_ORDER = ["typesafe-ai", "digitalocean"];

const QUESTION = "Which tool best serves the Caller's request?";

const NO_KEY = new ToolSelectorUnavailable({
  reason: "AI_GATEWAY_API_KEY is not set, so the request was matched locally",
  remedy: "export AI_GATEWAY_API_KEY to rank free-text requests with JEV",
});

const NO_CHOICE = new ToolSelectorUnavailable({
  reason: "JEV answered without choosing a tool, so the request was matched locally",
});

/** @typedef {ReturnType<ReturnType<typeof createGateway>["evaluationModel"]>} EvaluationModel */
/** @typedef {{ choice: string; probabilities?: Record<string, number> }} ChoiceAnswer */

/**
 * JEV's probabilities as ranked matches: known tools only, zero-probability options dropped.
 * @param {ChoiceAnswer} answer
 * @param {ReadonlyArray<import("@solos/core").ToolSummary>} tools
 * @returns {import("@solos/core").ToolMatch[]}
 */
const rankedMatches = (answer, tools) => {
  const known = new Set(tools.map((tool) => tool.name));
  const probabilities = answer.probabilities ?? { [answer.choice]: 1 };
  return Object.entries(probabilities)
    .filter(([name, probability]) => known.has(name) && probability > 0)
    .map(([name, probability]) => ({ name, score: Math.min(1, probability) }))
    .toSorted((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};

/**
 * A fixed sentence naming the status or the error class: a provider's message can echo its
 * response body, so it never travels.
 * @param {unknown} error
 */
const failed = (error) => {
  const { statusCode, name } = /** @type {{ statusCode?: unknown; name?: unknown }} */ (
    error ?? {}
  );
  const detail = typeof statusCode === "number" ? `HTTP ${statusCode}` : String(name ?? "error");
  return new ToolSelectorUnavailable({
    reason: `the JEV request failed (${detail}), so the request was matched locally`,
  });
};

/**
 * @param {EvaluationModel} model
 * @param {string} query
 * @param {ReadonlyArray<import("@solos/core").ToolSummary>} tools
 */
const evaluate = (model, query, tools) =>
  Effect.tryPromise({
    catch: failed,
    try: (signal) =>
      model.doEvaluate({
        state: { query },
        questions: {
          tool: {
            type: "choice",
            instructions: QUESTION,
            criteria: Object.fromEntries(tools.map((tool) => [tool.name, tool.title])),
          },
        },
        providerOptions: { gateway: { order: PROVIDER_ORDER } },
        abortSignal: signal,
      }),
  }).pipe(
    Effect.flatMap(({ answers }) =>
      answers.tool?.type === "choice"
        ? Effect.succeed(rankedMatches(answers.tool, tools))
        : Effect.fail(NO_CHOICE),
    ),
  );

/**
 * The key is optional when the Layer is built and checked on every call, as with Jupiter:
 * without it, a request fails before any HTTP and selection matches it locally.
 * @param {{ readonly baseUrl: string; readonly apiKey?: string }} config
 */
export const JevToolSelectorLive = (config) =>
  Layer.sync(ToolSelector, () => {
    const model = createGateway({ apiKey: config.apiKey, baseURL: config.baseUrl }).evaluationModel(
      JEV_MODEL_ID,
    );
    return {
      name: "jev",
      select: ({ query, tools }) =>
        config.apiKey?.trim() ? evaluate(model, query, tools) : Effect.fail(NO_KEY),
    };
  });
