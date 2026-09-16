// @ts-check
/**
 * The factory's shared Blob layer: the reserved-namespace registry and the document helpers every
 * Blob-backed tool reads and writes through. Feature modules import their prefix from here; any
 * general-purpose Blob tool added later must consult {@link reservedNamespaceForPath} before
 * acting, so a managed document can't be reached through a generic file operation.
 *
 * Authorization resolves from the ambient Vercel OIDC credentials. API failures propagate; each
 * tool maps them to its own output shape.
 */
import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";

/** Blob path prefix holding per-user preference files. */
export const USER_PREFERENCES_PREFIX = "user-preferences/";

/** Blob path prefix holding the shared factory brain. */
export const FACTORY_BRAIN_PREFIX = "factory-brain/";

/** Blob path prefix holding handoff artifacts passed between stations. */
export const ARTIFACTS_PREFIX = "artifacts/";

/**
 * @typedef {object} ReservedNamespace
 * @property {string} label Human-readable description of what the namespace holds.
 * @property {string} readTool Tool that reads this namespace.
 * @property {string} writeTool Tool that owns writes to this namespace.
 */

/** @type {Readonly<Record<string, ReservedNamespace>>} */
const RESERVED_NAMESPACES = {
  [ARTIFACTS_PREFIX]: {
    label: "handoff artifacts",
    readTool: "read-artifact",
    writeTool: "save-artifact",
  },
  [FACTORY_BRAIN_PREFIX]: {
    label: "the shared factory brain",
    readTool: "read-factory-brain",
    writeTool: "update-factory-brain",
  },
  [USER_PREFERENCES_PREFIX]: {
    label: "user preferences",
    readTool: "get-user-preferences",
    writeTool: "save-user-preferences",
  },
};

/** `put` drops leading slashes, so the guard must see the normalised form too. */
const LEADING_SLASHES = /^\/+/;

/**
 * The reserved namespace a Blob pathname falls under, if any.
 * @param {string} pathname
 * @returns {ReservedNamespace | null}
 */
export const reservedNamespaceForPath = (pathname) => {
  const normalized = pathname.replace(LEADING_SLASHES, "");
  const entry = Object.entries(RESERVED_NAMESPACES).find(([prefix]) =>
    normalized.startsWith(prefix),
  );
  return entry === undefined ? null : entry[1];
};

/**
 * The reserved namespace a Blob URL points at, if any. Unparseable input is not reserved.
 * @param {string} url
 * @returns {ReservedNamespace | null}
 */
export const reservedNamespaceForUrl = (url) => {
  try {
    return reservedNamespaceForPath(new URL(url).pathname);
  } catch {
    return null;
  }
};

/** @param {ReservedNamespace} namespace */
export const reservedWriteMessage = (namespace) =>
  `That path is reserved for ${namespace.label}: use ${namespace.writeTool} instead.`;

/** @param {ReservedNamespace} namespace */
export const reservedReadMessage = (namespace) =>
  `That path holds ${namespace.label}: use ${namespace.readTool} instead.`;

/**
 * Read a Markdown document by its exact key. A missing document is `found: false`, not an error.
 * @param {string} key
 * @returns {Promise<{ found: false } | { content: string; found: true; uploadedAt: string }>}
 */
export const readDocument = async (key) => {
  const result = await get(key, { access: "public" });
  if (result === null || result.stream === null) return { found: false };
  return {
    content: await new Response(result.stream).text(),
    found: true,
    uploadedAt: result.blob.uploadedAt.toISOString(),
  };
};

/**
 * Write a Markdown document at its exact key. The store is provisioned public; unguessability
 * comes from the hashed or suffixed keys the feature modules derive. Overwrite is the caller's
 * decision: singleton documents replace themselves, artifacts are write-once.
 * @param {string} key
 * @param {string} contents
 * @param {{ allowOverwrite: boolean }} options
 */
export const writeDocument = (key, contents, options) =>
  put(key, contents, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: options.allowOverwrite,
    contentType: "text/markdown",
  });

/**
 * Delete a document by its exact key, reporting whether one existed (`del` is silent about
 * missing objects).
 * @param {string} key
 * @returns {Promise<{ existed: boolean }>}
 */
export const deleteDocument = async (key) => {
  try {
    await head(key);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return { existed: false };
    throw error;
  }
  await del(key);
  return { existed: true };
};
