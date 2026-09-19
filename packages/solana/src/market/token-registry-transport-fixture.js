// @ts-check
import { getAddressDecoder } from "@solana/kit";
import { TOKEN_PROGRAM } from "./mint-account.js";
import { classicMintBytes } from "./test-fixtures.js";

/** Synthetic credential used to prove provider failure text never reaches a client. */
export const CREDENTIAL = "qa-synthetic-credential";

/** A fresh, never-funded address. */
export const randomMint = () =>
  getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

/**
 * A JSON-RPC endpoint whose every answer is a provider error whose message echoes a synthetic
 * credential, on a URL that itself carries the credential in path and query.
 */
export const startLeakyServer = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32_603,
          message: `internal quota failure for key ${CREDENTIAL} (endpoint ${CREDENTIAL})`,
        },
      }),
  });
  return {
    url: `http://127.0.0.1:${server.port}/qa/${CREDENTIAL}?api-key=${CREDENTIAL}`,
    stop: () => server.stop(true),
  };
};

/** An endpoint that always sends response headers and then never finishes the body. */
export const startStallServer = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { "content-type": "application/json" },
      }),
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/**
 * An endpoint serving one real classic mint; every other account (the metadata PDA) is null.
 * @param {string} mint
 */
export const startMintServer = (mint) => {
  const body = Buffer.from(classicMintBytes({ decimals: 6 })).toString("base64");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = /** @type {{ id: number; params: [string, unknown] }} */ (await request.json());
      const value =
        rpc.params[0] === mint
          ? {
              data: [body, "base64"],
              executable: false,
              lamports: 1_461_600,
              owner: TOKEN_PROGRAM,
              space: 82,
            }
          : null;
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { context: { slot: 1 }, value } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, mint, stop: () => server.stop(true) };
};
