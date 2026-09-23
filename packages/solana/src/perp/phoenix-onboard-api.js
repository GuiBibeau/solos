// @ts-check
import { z } from "zod";
import { DEFAULT_TIMEOUT_MS } from "./phoenix-api.js";
import { parseJson } from "./phoenix-wire.js";

const instruction = z.object({
  programId: z.string(),
  data: z.array(z.number().int().min(0).max(255)).min(8).max(256),
  keys: z
    .array(z.object({ pubkey: z.string(), isSigner: z.boolean(), isWritable: z.boolean() }))
    .max(64),
});
export const RegisterBuild = z.object({
  instructions: z.array(instruction).min(1).max(8),
  traderPda: z.string(),
  traderOnboarder: z.string(),
  txFeePayer: z.string(),
  maxPositions: z.number().int().min(32).max(128),
  includeRegisterTrader: z.boolean(),
});
export const RegisterSent = RegisterBuild.omit({ instructions: true }).extend({
  signature: z.string(),
});

/** Bounded JSON response from the official Phoenix onboarding API; one attempt, no retries. */
/** @param {Response} response */
const boundedJson = async (response) => {
  if (!response.body) throw new Error("empty Phoenix response");
  const reader = response.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000) {
        await reader.cancel();
        throw new Error("Phoenix response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return parseJson(new TextDecoder().decode(data));
};

/** A bounded public read for onboarding, including the HTTP 404 = unregistered case.
 * @param {import("./phoenix-api.js").PhoenixConfig} config @param {string} path
 */
export const phoenixOnboardGet = async (config, path) => {
  const url = new URL(path, config.baseUrl);
  url.searchParams.set("traderPdaIndex", "0");
  const response = await (config.fetchImpl ?? fetch)(url.href, {
    signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (response.status < 200 || response.status >= 300) {
    await response.body?.cancel();
    return { status: response.status, body: undefined };
  }
  return { status: response.status, body: await boundedJson(response) };
};

/** @param {import("./phoenix-api.js").PhoenixConfig} config @param {string} path @param {unknown} request */
export const phoenixPost = async (config, path, request) => {
  const response = await (config.fetchImpl ?? fetch)(new URL(path, config.baseUrl).href, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Phoenix onboarding HTTP ${response.status}`);
  }
  return await boundedJson(response);
};
