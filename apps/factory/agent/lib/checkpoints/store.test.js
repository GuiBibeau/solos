// @ts-check
import { describe, expect, test } from "bun:test";
import { checkpointKey } from "./config.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createCheckpointStore } from "./store.js";

const createMemoryIo = () => {
  const documents = new Map();
  let version = 0;
  return {
    corrupt: (key) => documents.set(key, { contents: "not json", etag: "corrupt" }),
    io: {
      read: async (key) => {
        const document = documents.get(key);
        if (document === undefined) return { found: /** @type {const} */ (false) };
        return {
          content: document.contents,
          etag: document.etag,
          found: /** @type {const} */ (true),
          uploadedAt: "2026-09-19T00:00:00.000Z",
        };
      },
      write: async (key, contents, options) => {
        const current = documents.get(key);
        if (current !== undefined && !options.allowOverwrite) throw new Error("already exists");
        if (options.ifMatch !== undefined && options.ifMatch !== current?.etag)
          throw new Error("precondition failed");
        version += 1;
        documents.set(key, { contents, etag: `etag-${version}` });
      },
    },
  };
};

describe("[integration] durable checkpoint store", () => {
  test("survives a new reader and rejects an older delayed save", async () => {
    const memory = createMemoryIo();
    const firstProcess = createCheckpointStore(memory.io);
    const initial = { ...issue18Checkpoint, outcome: "active", revision: 1 };
    expect(await firstProcess.save(initial)).toMatchObject({ saved: true });

    const restartedProcess = createCheckpointStore(memory.io);
    expect(await restartedProcess.read(initial)).toMatchObject({
      checkpoint: { branch: initial.branch, diagnostics: initial.diagnostics, revision: 1 },
      found: true,
    });

    const current = { ...initial, nextMilestone: "Run focused typecheck.", revision: 2 };
    expect(await restartedProcess.save(current)).toMatchObject({ saved: true });
    expect(await firstProcess.save(initial)).toMatchObject({ saved: false });
    expect(await restartedProcess.read(initial)).toMatchObject({
      checkpoint: { nextMilestone: "Run focused typecheck.", revision: 2 },
      found: true,
    });
  });

  test("fails closed on malformed stored content", async () => {
    const memory = createMemoryIo();
    const key = checkpointKey(
      issue18Checkpoint.workItem,
      issue18Checkpoint.rootRunId,
      issue18Checkpoint.station,
    );
    if (key === null) throw new Error("fixture key must be valid");
    memory.corrupt(key);
    expect(await createCheckpointStore(memory.io).read(issue18Checkpoint)).toMatchObject({
      found: false,
    });
  });
});
