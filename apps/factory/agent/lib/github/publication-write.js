// @ts-check
import { readPublicationPull, writePublicationBody } from "./publication-github.js";

const MAX_ATTEMPTS = 3;

/** @typedef {Awaited<ReturnType<typeof readPublicationPull>>} PublicationPull */
/** @typedef {import("./rebase-api.js").RebaseApi} Api */

/** Optimistically merge with the freshest body and verify the durable result.
 * @param {{api: Api, pullNumber: number, targetSha: string, initial: PublicationPull,
 * mutate: (body: string) => string, accepts: (body: string) => boolean}} input
 */
export const writePublicationMutation = async (input) => {
  let candidate = input.initial;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (input.accepts(candidate.body)) return acceptedMutation(candidate);
    const body = input.mutate(candidate.body);
    const write = await writePublicationBody(input.api, input.pullNumber, {
      body,
      expected: candidate,
    });
    if (write.status === "conflict") {
      candidate = write.pull;
      continue;
    }
    const written = write.pull;
    if (written.head !== input.targetSha) return { status: "stale", pull: written };
    const confirmed = await readPublicationPull(input.api, input.pullNumber);
    if (confirmed.head !== input.targetSha) return { status: "stale", pull: confirmed };
    if (input.accepts(confirmed.body)) {
      const mutationAt = validTimestamp(confirmed.updatedAt);
      return mutationAt
        ? { status: "written", pull: confirmed, mutationAt }
        : { status: "invalid-time", pull: confirmed };
    }
    candidate = confirmed;
  }
  return { status: "conflict", pull: candidate };
};

/** @param {PublicationPull} pull */
const acceptedMutation = (pull) => {
  const mutationAt = validTimestamp(pull.updatedAt);
  return mutationAt ? { status: "written", pull, mutationAt } : { status: "invalid-time", pull };
};

/** @param {string} value */
const validTimestamp = (value) => (Number.isFinite(Date.parse(value)) ? value : undefined);
