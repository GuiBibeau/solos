// @ts-check
import { describe, expect, test } from "bun:test";
import { runSolos } from "./cli-fixture.js";

/**
 * The developer lever is a checkout tool, not a product surface (ADR-0034): `solos dev` exists
 * only under `SOLOS_DEV=1`, which the repo's `bun run solos` script sets. `runSolos` builds the
 * child env from scratch, so the flag this test runner itself inherited never leaks in.
 */
describe("the developer lever is opt-in through SOLOS_DEV [integration]", () => {
  test("without the flag, --help is the operator surface and names no lever", async () => {
    const { stdout, code } = await runSolos(["--help"], {});
    expect(code).toBe(0);
    expect(stdout).toContain("wallet");
    expect(stdout).toContain("mcp");
    expect(stdout).not.toMatch(/^\s*-\s+dev\b/m);
    expect(stdout).not.toContain("verification lever");
    expect(stdout).not.toContain("Evidence");
  });

  test("without the flag, solos dev verify is an unknown command that never names dev", async () => {
    const { stdout, stderr, code } = await runSolos(["dev", "verify", "--scope", "check"], {});
    expect(code).not.toBe(0);
    expect(stderr).toContain("Invalid subcommand for solos");
    expect(`${stdout}${stderr}`).not.toContain("'dev'");
    expect(`${stdout}${stderr}`).not.toContain("verification lever");
  });

  test("a blank SOLOS_DEV, as a copied .env.example leaves it, means unset", async () => {
    const { stderr, code } = await runSolos(["dev"], { SOLOS_DEV: "" });
    expect(code).not.toBe(0);
    expect(stderr).toContain("Invalid subcommand for solos");
  });

  test("with SOLOS_DEV=1 the lever is present with verify and evidence", async () => {
    const { stdout, code } = await runSolos(["dev", "--help"], { SOLOS_DEV: "1" });
    expect(code).toBe(0);
    expect(stdout).toContain("verify");
    expect(stdout).toContain("evidence");
    expect(stdout).toContain("surfpool");
  });
});
