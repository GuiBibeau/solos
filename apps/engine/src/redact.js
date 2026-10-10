// @ts-check

/**
 * Drop the bearer token and any RPC path, query, user or password from stderr. The origin
 * stays. Installed once, restored by the returned function.
 * @param {{ readonly token: string; readonly rpcUrl: string }} secrets
 */
export const installRedaction = ({ token, rpcUrl }) => {
  const needles = needlesOf(token, rpcUrl);
  const write = process.stderr.write.bind(process.stderr);
  const wrapped = (
    /** @type {string | Uint8Array} */ chunk,
    /** @type {BufferEncoding | undefined} */ encoding,
    /** @type {((error?: Error | null) => void) | undefined} */ callback,
  ) => write(redactChunk(chunk, needles), encoding, callback);
  process.stderr.write = /** @type {typeof process.stderr.write} */ (
    /** @type {unknown} */ (wrapped)
  );
  return () => {
    if (process.stderr.write === wrapped) process.stderr.write = write;
  };
};

/**
 * Longest first, so a full URL is removed before a shorter path that is part of it.
 * @param {string} token
 * @param {string} rpcUrl
 */
const needlesOf = (token, rpcUrl) => {
  /** @type {string[]} */
  const needles = token.length > 0 ? [token] : [];
  needles.push(...urlNeedles(rpcUrl));
  return needles.toSorted((left, right) => right.length - left.length);
};

/** @param {string} rpcUrl */
const urlNeedles = (rpcUrl) => {
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    return [];
  }
  return [
    ...(rpcUrl === url.origin ? [] : [rpcUrl]),
    ...(url.pathname === "/" || url.pathname === "" ? [] : [url.pathname]),
    ...(url.search === "" ? [] : [url.search]),
    ...(url.username === "" ? [] : [decodeURIComponent(url.username)]),
    ...(url.password === "" ? [] : [decodeURIComponent(url.password)]),
  ];
};

/**
 * @param {string | Uint8Array} chunk
 * @param {ReadonlyArray<string>} needles
 */
const redactChunk = (chunk, needles) => {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  const cleaned = needles.reduce(
    (out, needle) => (needle.length === 0 ? out : out.split(needle).join("[redacted]")),
    text,
  );
  return typeof chunk === "string" ? cleaned : Buffer.from(cleaned);
};
