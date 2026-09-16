// @ts-check
/**
 * Key derivation and size bound for the shared factory brain: durable notes about the target
 * repository under the reserved `factory-brain/` prefix, readable by every run, writable only by
 * trusted callers (see `github/approval.js`).
 */
import { createHash } from "node:crypto";
import { FACTORY_BRAIN_PREFIX } from "./blob.js";
import { FACTORY_REPO } from "./constants.js";

/** The brain is a short, curated set of notes, not a transcript of every run. */
export const MAX_FACTORY_BRAIN_LENGTH = 40_000;

/**
 * The Blob key holding the brain for the target repository. Derived from `FACTORY_REPO` alone,
 * never from model input or a caller's principal, so every session on one deployment reads and
 * writes the same document, and a deployment targeting another repository gets its own.
 */
export const factoryBrainKey = () => {
  const id = createHash("sha256").update(FACTORY_REPO).digest("hex");
  return `${FACTORY_BRAIN_PREFIX}${id}.md`;
};
