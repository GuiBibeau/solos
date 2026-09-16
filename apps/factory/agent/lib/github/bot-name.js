// @ts-check
/**
 * The name the factory answers to in `@mentions`, resolved from the GitHub App's own slug so the
 * mention follows whatever the deployer named their app. A hardcoded handle could belong to a real
 * GitHub user.
 */
import { getConnectorMetadata } from "@vercel/connect";
import { GITHUB_CONNECTOR } from "./credentials.js";

/** Used where a resolution failure must not stop the work, like the sandbox commit identity. */
export const FALLBACK_BOT_NAME = "solos-factory";

/** Bound before the name is interpolated into a regular expression. */
const MAX_BOT_NAME_LENGTH = 80;

/** @type {string | undefined} */
let resolvedFromConnector;

/**
 * Resolution order: `FACTORY_BOT_NAME`, then `GITHUB_APP_SLUG`, then the connector's
 * `vendor.appSlug`. Throws when the metadata is unreachable or carries no usable slug, and the
 * failure is never cached: eve calls this lazily inside request handling, caches a fulfilled name,
 * and retries a rejection on the next event.
 * @returns {Promise<string>}
 */
export const resolveBotName = async () => {
  const override = process.env.FACTORY_BOT_NAME ?? process.env.GITHUB_APP_SLUG;
  if (override !== undefined && override !== "") return override;
  if (resolvedFromConnector !== undefined) return resolvedFromConnector;
  const metadata = await getConnectorMetadata(GITHUB_CONNECTOR);
  const slug = metadata.vendor.appSlug;
  if (typeof slug !== "string" || slug.length === 0 || slug.length > MAX_BOT_NAME_LENGTH) {
    throw new Error(`Connector ${GITHUB_CONNECTOR} metadata carries no usable GitHub App slug.`);
  }
  resolvedFromConnector = slug;
  return slug;
};

/**
 * The mention matcher for a resolved bot name: `@<name>` on a word boundary. The name is escaped
 * for literal matching, and {@link resolveBotName} bounds its length.
 * @param {string} botName
 */
export const mentionPattern = (botName) => {
  const escaped = botName.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
  return new RegExp(String.raw`@${escaped}(?=$|[^\w-])`, "iu");
};
