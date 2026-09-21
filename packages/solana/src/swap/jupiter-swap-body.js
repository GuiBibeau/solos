// @ts-check

/** The most decoded response bytes accepted from either Jupiter Swap V2 endpoint. */
export const MAX_SWAP_RESPONSE_BYTES = 1_048_576;

const BODY_LIMIT_REASON = "Jupiter swap response exceeded the byte limit";

/** @param {Response} response */
const declaredBodyTooLarge = (response) => {
  const value = response.headers.get("content-length")?.trim();
  return value && /^\d+$/.test(value) ? BigInt(value) > BigInt(MAX_SWAP_RESPONSE_BYTES) : false;
};

/** @param {ReadableStreamDefaultReader<Uint8Array>} reader */
const cancelReader = (reader) => {
  void reader.cancel().catch(() => undefined);
};

/**
 * Read and decode one response under a hard byte ceiling. The stream count remains authoritative
 * when Content-Length is absent, compressed, or dishonest. Limit failures never include body text.
 * @param {Response} response
 */
export const boundedResponseText = async (response) => {
  if (declaredBodyTooLarge(response)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(BODY_LIMIT_REASON);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      bytes += part.value.byteLength;
      if (bytes > MAX_SWAP_RESPONSE_BYTES) {
        cancelReader(reader);
        throw new Error(BODY_LIMIT_REASON);
      }
      text += decoder.decode(part.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
};
