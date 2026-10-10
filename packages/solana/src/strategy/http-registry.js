// @ts-check
import { StrategyRegistry } from "@solos/core";
import { Layer } from "effect";
import { engineGet, enginePost } from "../executor/engine-client.js";

const TIMEOUT_MS = 10_000;

/**
 * Registry adapter for the MCP server and the CLI. It forwards to the Engine and does not
 * carry the lifecycle table.
 * @param {{ readonly url: string; readonly token: string }} engine
 */
export const HttpStrategyRegistry = (engine) => Layer.sync(StrategyRegistry, () => service(engine));

/**
 * The HTTP body is the Registry result. Domain errors are rebuilt from the envelope.
 * @param {{ readonly url: string; readonly token: string }} engine
 */
const service = (engine) =>
  /** @type {import("@solos/core/strategy").StrategyRegistryShape} */ ({
    register: (draft) => enginePost(engine, "/v1/strategies", body(draft)),
    update: (id, state) =>
      enginePost(engine, `/v1/strategies/${encodeURIComponent(id)}/state`, body({ state })),
    list: (filter) => engineGet(engine, listPath(filter), TIMEOUT_MS),
    get: (id) => engineGet(engine, `/v1/strategies/${encodeURIComponent(id)}`, TIMEOUT_MS),
    simulateRegister: (draft) => enginePost(engine, "/v1/strategies/simulate", body(draft)),
    simulateUpdate: (id, state) =>
      enginePost(
        engine,
        `/v1/strategies/${encodeURIComponent(id)}/state/simulate`,
        body({ state }),
      ),
    ticks: (input) => engineGet(engine, ticksPath(input), TIMEOUT_MS),
  });

/** @param {unknown} value */
const body = (value) => ({ body: value, timeoutMs: TIMEOUT_MS });

/** @param {{ id: string; limit?: number; outcome?: string }} input */
const ticksPath = (input) => {
  const search = new URLSearchParams();
  if (input.limit !== undefined) search.set("limit", String(input.limit));
  if (input.outcome !== undefined) search.set("outcome", input.outcome);
  const query = search.toString();
  const path = `/v1/strategies/${encodeURIComponent(input.id)}/ticks`;
  return query.length === 0 ? path : `${path}?${query}`;
};

/** @param {{ state?: string; owner?: string }} filter */
const listPath = (filter) => {
  const search = new URLSearchParams();
  if (filter.state !== undefined) search.set("state", filter.state);
  if (filter.owner !== undefined) search.set("owner", filter.owner);
  const query = search.toString();
  return query.length === 0 ? "/v1/strategies" : `/v1/strategies?${query}`;
};
