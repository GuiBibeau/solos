import { describe, expect, test } from "bun:test";
import { captureCommand, lastLine, runStep, runSteps } from "./run-steps.js";

const echo = { name: "echo", command: ["bun", "-e", "console.log('x')"] };
const fails = { name: "fails", command: ["bun", "-e", "console.error('boom'); process.exit(2)"] };
const quiet = { name: "quiet", command: ["bun", "-e", "0"] };

describe("evidence step runner", () => {
  test("lastLine takes the last non-empty line, truncated to 200 chars", () => {
    expect(lastLine("a\n\nb  \n\n")).toBe("b");
    expect(lastLine("")).toBe("");
    expect(lastLine(`first\n${"y".repeat(300)}`)).toHaveLength(200);
  });

  test("captureCommand returns exit code and combined output", async () => {
    const result = await captureCommand(fails.command);
    expect(result.code).toBe(2);
    expect(result.output).toContain("boom");
  });

  test("captureCommand reports a missing binary instead of throwing", async () => {
    const result = await captureCommand(["definitely-not-a-binary-solos", "--version"]);
    expect(result.code).not.toBe(0);
  });

  test("runStep records ok, duration, and summary", async () => {
    const step = await runStep(echo);
    expect(step).toMatchObject({
      name: "echo",
      command: "bun -e console.log('x')",
      ok: true,
      summary: "x",
    });
    expect(step.ms).toBeGreaterThanOrEqual(0);
  });

  test("silent success summarises as ok", async () => {
    expect((await runStep(quiet)).summary).toBe("ok");
  });

  test("runSteps stops at the first failure and marks the rest skipped", async () => {
    const steps = await runSteps([echo, fails, echo, quiet]);
    expect(steps.map((s) => s.ok)).toEqual([true, false, null, null]);
    expect(steps[1].summary).toBe("boom");
    expect(steps[2]).toEqual({
      name: "echo",
      command: echo.command.join(" "),
      ok: null,
      ms: 0,
      summary: "skipped",
    });
  });

  test("runSteps runs everything when all pass", async () => {
    const steps = await runSteps([echo, quiet]);
    expect(steps.every((s) => s.ok === true)).toBe(true);
  });
});
