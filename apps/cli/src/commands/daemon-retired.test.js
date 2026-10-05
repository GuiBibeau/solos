// @ts-check
import { describe, expect, test } from "bun:test";
import { runSolos } from "./cli-fixture.js";

/** `solos daemon` is retired (#193): `--help` no longer lists it and invoking it is a parse error. */
describe("solos daemon is retired [integration]", () => {
  test("--help lists no daemon command, with or without the lever", async () => {
    for (const env of [{}, { SOLOS_DEV: "1" }]) {
      const { stdout, code } = await runSolos(["--help"], env);
      expect(code).toBe(0);
      expect(stdout).toContain("agent");
      expect(stdout).not.toContain("daemon");
    }
  });

  test("solos daemon is an invalid subcommand, not a harness start", async () => {
    const { stderr, code } = await runSolos(["daemon"], {});
    expect(code).not.toBe(0);
    expect(stderr).toContain("Invalid subcommand for solos");
    expect(stderr).not.toContain("SignerConfigMissing");
  });
});
