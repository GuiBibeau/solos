import { describe, expect, test } from "bun:test";

const runner = new URL("run-steps.js", import.meta.url).href;

describe("verification failure diagnostics [integration]", () => {
  test("keeps Evidence on stdout and exposes a bounded, redacted failure on stderr", async () => {
    const failing = [
      "console.error('fixture assertion: expected 3, received 2');",
      "console.error('at wallet-fixture.test.js:12');",
      "console.error('surfpool: upstream=' + process.env.SURFNET_DATASOURCE_RPC_URL);",
      "console.error('authorization=' + process.env.DIAGNOSTIC_TEST_TOKEN);",
      "console.error('x'.repeat(100_000));",
      "console.error('1 fail'); process.exit(7);",
    ].join("\n");
    const source = `import { runStep } from ${JSON.stringify(runner)};
      const step = await runStep(${JSON.stringify({ name: "test:integration", command: ["bun", "-e", failing] })});
      process.stdout.write(JSON.stringify(step));`;
    const child = Bun.spawn(["bun", "--no-env-file", "-e", source], {
      env: {
        PATH: process.env.PATH ?? "",
        SURFNET_DATASOURCE_RPC_URL: "https://fixture.invalid/private-rpc-token/",
        DIAGNOSTIC_TEST_TOKEN: "private-test-token",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, summary: "1 fail" });
    expect(stderr).toContain("fixture assertion: expected 3, received 2");
    const diagnostic = JSON.parse(stderr);
    expect(diagnostic).toMatchObject({
      event: "verification.step.failed",
      step: "test:integration",
      exitCode: 7,
      truncated: true,
    });
    expect(diagnostic.output).toContain("at wallet-fixture.test.js:12");
    expect(diagnostic.output).toContain("surfpool: upstream=[redacted]");
    expect(diagnostic.output).toContain("1 fail");
    expect(diagnostic.output.length).toBeLessThanOrEqual(65_536);
    expect(stderr).not.toContain("private-rpc-token");
    expect(stderr).not.toContain("private-test-token");
  });
});
