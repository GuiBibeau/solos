// @ts-check
/**
 * What the MCP Registry already knows about a server version. The registry never republishes a
 * version, so a promote must learn whether the version is listed before it moves a pointer, and
 * a version the registry has deleted is never promoted.
 */
import { captureCommand } from "../evidence/run-steps.js";
import { ReleaseRefused } from "./errors.js";
import { parsed } from "./run-plan.js";

/** @typedef {import("./run-plan.js").Runner} Runner */

export const REGISTRY_URL = "https://registry.modelcontextprotocol.io";
const OFFICIAL = "io.modelcontextprotocol.registry/official";

/** The body and the HTTP status curl appended as the last line. @param {string} text */
const splitAnswer = (text) => {
  const trimmed = text.trimEnd();
  const cut = trimmed.lastIndexOf("\n");
  return cut === -1
    ? { body: "", status: trimmed }
    : { body: trimmed.slice(0, cut), status: trimmed.slice(cut + 1) };
};

/** What the probe learned: an HTTP status, or the curl exit when no request completed. @param {number} code @param {string} status */
const registryAnswer = (code, status) =>
  code === 0 ? `HTTP ${/^(\d{3})$/u.exec(status.trim())?.[1] ?? "?"}` : `curl exit ${code}`;

/**
 * The lifecycle status the registry stores on the version (active, deprecated or deleted), or
 * null when the body is not the registry's JSON.
 * @param {string} body
 * @returns {string | null}
 */
const registryStatus = (body) => {
  try {
    const value = /** @type {{ _meta?: Record<string, { status?: unknown }> }} */ (
      JSON.parse(body)
    );
    const status = value?._meta?.[OFFICIAL]?.status;
    return status === undefined ? "active" : String(status);
  } catch {
    return null;
  }
};

/** @param {string} server @param {string} detail */
const lookupFailed = (server, detail) =>
  new ReleaseRefused({
    reason: `MCP Registry lookup for ${server} failed (${detail}); nothing was changed`,
    remedy: "retry when the registry answers, or pass --skip-registry to promote without it",
  });

/**
 * Whether the MCP Registry lists this server version. Deleted versions are asked for too: the
 * registry hides them by default but still refuses to publish them again, and a version taken
 * down must not become latest. Only a 200 or a 404 is an answer; any other status, a transport
 * failure or a body that is not the registry's JSON refuses before a single pointer moves.
 * @param {{ name: string; version: string }} server @param {Runner} [runner]
 */
export const registryHasVersion = async ({ name, version }, runner = captureCommand) => {
  const server = `${name}@${version}`;
  const url = `${REGISTRY_URL}/v0.1/servers/${encodeURIComponent(name)}/versions/${version}?include_deleted=true`;
  const result = await runner(["curl", "-sS", "-w", String.raw`\n%{http_code}`, url]);
  const { body, status } = splitAnswer(parsed(result));
  const answer = registryAnswer(result.code, status);
  if (answer === "HTTP 404") return false;
  if (answer !== "HTTP 200") throw lookupFailed(server, answer);
  const state = registryStatus(body);
  if (state === null) throw lookupFailed(server, "HTTP 200 with a body that is not JSON");
  if (state === "deleted") {
    throw new ReleaseRefused({
      reason: `${server} is deleted in the MCP Registry; a deleted version is never republished or promoted`,
      remedy: "fix forward: prepare a patch release and promote it",
    });
  }
  return true;
};
