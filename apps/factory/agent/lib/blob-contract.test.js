// @ts-check
import { expect, test } from "bun:test";
import { writeDocument } from "./blob.js";

const blobResponse = {
  contentDisposition: "inline",
  contentType: "application/json",
  downloadUrl: "https://test.public.blob.vercel-storage.com/checkpoint.json?download=1",
  etag: "etag-new",
  pathname: "station-checkpoints/checkpoint.json",
  url: "https://test.public.blob.vercel-storage.com/checkpoint.json",
};

const restoreEnvironment = (/** @type {Record<string, string | undefined>} */ previous) => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

test("[integration] Blob adapter sends conditional overwrite through the real SDK", async () => {
  /** @type {Request | undefined} */
  let captured;
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      captured = request.clone();
      await request.text();
      return Response.json(blobResponse);
    },
  });
  const previous = {
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VERCEL_BLOB_API_URL: process.env.VERCEL_BLOB_API_URL,
    VERCEL_BLOB_RETRIES: process.env.VERCEL_BLOB_RETRIES,
  };
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_secret";
  process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${server.port}`;
  process.env.VERCEL_BLOB_RETRIES = "0";
  try {
    await writeDocument("station-checkpoints/checkpoint.json", "{}", {
      allowOverwrite: true,
      contentType: "application/json",
      ifMatch: "etag-old",
    });
    expect(new URL(captured?.url ?? "http://invalid").searchParams.get("pathname")).toBe(
      "station-checkpoints/checkpoint.json",
    );
    expect(captured?.headers.get("x-allow-overwrite")).toBe("1");
    expect(captured?.headers.get("x-if-match")).toBe("etag-old");
    expect(captured?.headers.get("x-content-type")).toBe("application/json");
  } finally {
    server.stop(true);
    restoreEnvironment(previous);
  }
});
