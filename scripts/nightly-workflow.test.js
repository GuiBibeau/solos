// @ts-check
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/nightly.yml", import.meta.url)),
  "utf8",
);

const VERIFY_LINE =
  '          bun run solos dev verify --scope full --json > "$RUNNER_TEMP/evidence-nightly.json" 2> "$RUNNER_TEMP/diagnostics-nightly.log" || status=$?';

/** The job body, from its key through the line before the next two-space job key. @param {string} name */
const job = (name) => {
  const marker = `\n  ${name}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error(`missing job ${name}`);
  const rest = workflow.slice(start + marker.length);
  const match = /\n {2}[^ \n]/u.exec(rest);
  const end = match === null ? workflow.length : start + marker.length + match.index;
  return workflow.slice(start, end);
};

/** The failure reprint, with the verify command replaced by a fixture write. */
const reprintBranch = () => {
  const fork = job("mainnet-fork");
  const start = fork.indexOf("          status=0\n");
  const from = start === -1 ? "" : fork.slice(start);
  const end = from.indexOf("\n          fi\n");
  if (start === -1 || end === -1) throw new Error("missing diagnostics reprint");
  const branch = from.slice(0, end + "\n          fi\n".length);
  if (!branch.includes(VERIFY_LINE)) throw new Error("verify command drifted");
  return branch.replace(
    VERIFY_LINE,
    [
      '          printf "%s" "$NIGHTLY_LOG" > "$RUNNER_TEMP/diagnostics-nightly.log"',
      "          status=$NIGHTLY_EXIT",
    ].join("\n"),
  );
};

/**
 * Run the workflow's failure branch under the Actions shell flags.
 * @param {string} log
 * @param {number} verifyExit
 */
const runReprint = async (log, verifyExit) => {
  const runnerTemp = await mkdtemp(path.join(tmpdir(), "nightly-diag-"));
  const proc = Bun.spawn(["bash", "-eo", "pipefail", "-c", reprintBranch()], {
    env: {
      RUNNER_TEMP: runnerTemp,
      NIGHTLY_LOG: log,
      NIGHTLY_EXIT: String(verifyExit),
      PATH: process.env.PATH ?? "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  await rm(runnerTemp, { recursive: true, force: true });
  return { stdout, stderr, code };
};

describe("nightly workflow [integration]", () => {
  test("prune-canaries names the repository because the job does not check out", () => {
    const prune = job("prune-canaries");
    expect(prune).not.toContain("actions/checkout");
    const deletes = prune.split("\n").filter((line) => line.includes("gh release delete"));
    expect(deletes).toEqual([
      '            gh release delete "$tag" --cleanup-tag --yes --repo "$GITHUB_REPOSITORY"',
    ]);
  });

  test("a failed online verify reprints bounded diagnostics on the step log", () => {
    const fork = job("mainnet-fork");
    expect(fork).toContain(VERIFY_LINE);
    expect(fork).toContain('if [ "$status" -ne 0 ]; then');
    expect(fork).toContain("----- diagnostics-nightly (secret-redacted) -----");
    expect(fork).toContain('cat "$RUNNER_TEMP/diagnostics-nightly.log"');
    expect(fork).toContain("[diagnostic output truncated]");
    expect(fork).toContain("} >&2");
    expect(fork).toContain('exit "$status"');
    expect(fork).toContain("apps/cli/src/evidence/diagnostics.js");
  });

  test("the reprint keeps a short failure and bounds a long one", async () => {
    const short = "fixture assertion: expected 3, received 2\nat wallet-fixture.test.js:12\n";
    const failed = await runReprint(short, 7);
    expect(failed.code).toBe(7);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toContain("----- diagnostics-nightly (secret-redacted) -----");
    expect(failed.stderr).toContain(short.trim());
    expect(failed.stderr).not.toContain("[diagnostic output truncated]");

    const head = "HEAD_ASSERTION";
    const tail = "TAIL_STACK";
    const middle = "SECRET_MIDDLE_TOKEN";
    const pad = "x".repeat(40_000);
    const bounded = await runReprint(head + pad + middle + pad + tail, 7);
    expect(bounded.code).toBe(7);
    expect(bounded.stderr).toContain(head);
    expect(bounded.stderr).toContain(tail);
    expect(bounded.stderr).toContain("[diagnostic output truncated]");
    expect(bounded.stderr).not.toContain(middle);
    expect(bounded.stderr.length).toBeLessThanOrEqual(66_000);

    const passed = await runReprint("should-not-print", 0);
    expect(passed).toEqual({ stdout: "", stderr: "", code: 0 });
  });
});
