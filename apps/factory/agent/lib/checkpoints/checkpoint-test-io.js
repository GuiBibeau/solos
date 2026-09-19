// @ts-check

export const createCheckpointMemoryIo = () => {
  /** @type {Map<string, {content: string; etag: string}>} */
  const documents = new Map();
  let shouldFailAfterWrite = false;
  let version = 0;
  const read = async (/** @type {string} */ key) => {
    const document = documents.get(key);
    return document === undefined
      ? { found: /** @type {const} */ (false) }
      : {
          ...document,
          found: /** @type {const} */ (true),
          uploadedAt: "2026-09-19T00:00:00.000Z",
        };
  };
  const write = async (
    /** @type {string} */ key,
    /** @type {string} */ content,
    /** @type {{allowOverwrite: boolean; ifMatch?: string}} */ options,
  ) => {
    const current = documents.get(key);
    if (current !== undefined && !options.allowOverwrite) throw new Error("already exists");
    if (options.ifMatch !== undefined && options.ifMatch !== current?.etag)
      throw new Error("precondition failed");
    version += 1;
    documents.set(key, { content, etag: `etag-${version}` });
    if (shouldFailAfterWrite) {
      shouldFailAfterWrite = false;
      throw new Error("response lost after commit");
    }
  };
  return {
    corrupt: (/** @type {string} */ key) =>
      documents.set(key, { content: "not json", etag: "corrupt" }),
    failAfterNextWrite: () => {
      shouldFailAfterWrite = true;
    },
    io: { read, write },
  };
};
