// @ts-check
/**
 * The version every surface reports: `solos --version`, the MCP `serverInfo` and the ready line.
 * `solos dev build` defines `process.env.SOLOS_VERSION` and `process.env.SOLOS_COMMIT` at bundle
 * time, so a compiled binary carries its release and the commit it was built from; a checkout
 * reports 0.0.0 and no commit (ADR-0035, ADR-0036).
 */
export const SOLOS_VERSION = process.env.SOLOS_VERSION ?? "0.0.0";

/** The full commit sha the binary was built from, or null in a checkout. */
export const SOLOS_COMMIT = process.env.SOLOS_COMMIT ?? null;
