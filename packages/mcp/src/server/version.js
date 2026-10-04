// @ts-check
/**
 * The version every surface reports: `solos --version`, the MCP `serverInfo` and the ready line.
 * `solos dev build` defines `process.env.SOLOS_VERSION` at bundle time, so a compiled binary
 * carries its release; a checkout reports 0.0.0 (ADR-0035).
 */
export const SOLOS_VERSION = process.env.SOLOS_VERSION ?? "0.0.0";
