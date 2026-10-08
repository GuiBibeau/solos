// @ts-check
import nodePath from "node:path";

/** Static files of the landing site. Any static host can serve this directory as-is. */
export const PUBLIC_DIR = nodePath.resolve(import.meta.dir, "../public");
const DEFAULT_PORT = 4173;
const NOT_FOUND = () => new Response("Not found", { status: 404 });

/**
 * Map a URL path to a file under `public/`, or `undefined` when it escapes the directory.
 * `/` serves `index.html`; everything else is served verbatim, so links use `.html` and work on
 * hosts without clean URLs.
 * @param {string} pathname
 * @returns {string | undefined}
 */
export const resolvePublicFile = (pathname) => {
  let relative;
  try {
    relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).slice(1);
  } catch {
    return undefined;
  }
  const absolute = nodePath.resolve(PUBLIC_DIR, relative);
  return absolute.startsWith(`${PUBLIC_DIR}${nodePath.sep}`) ? absolute : undefined;
};

/** @param {Request} request */
const serveFile = async (request) => {
  const path = resolvePublicFile(new URL(request.url).pathname);
  if (!path) return NOT_FOUND();
  const file = Bun.file(path);
  return (await file.exists()) ? new Response(file) : NOT_FOUND();
};

/** @param {number} port */
export const startLanding = (port) => Bun.serve({ port, fetch: serveFile });

if (import.meta.main) {
  const server = startLanding(Number(process.env.PORT ?? DEFAULT_PORT));
  console.error(JSON.stringify({ level: "info", msg: "landing dev server", url: server.url.href }));
}
