// @ts-check
import { readFileSync } from "node:fs";
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { formatTable } from "../evidence/format.js";
import { checkPrBody } from "../evidence/pr-body.js";
import { runVerify } from "../evidence/verify.js";
import { emit, exitOnFailure } from "../output.js";

const scope = Options.choice("scope", ["check", "unit", "full"]).pipe(
  Options.withDefault("full"),
  Options.withDescription("check: static checks; unit: + unit tests; full: + integration tests"),
);
const json = Options.boolean("json").pipe(
  Options.withDescription("Only the Evidence JSON on stdout; no table on stderr"),
);
const qa = Options.choice("qa", ["iris", "elfa-market"]).pipe(
  Options.optional,
  Options.withDescription(
    "Live CLI + MCP QA: iris (2 Chat calls), elfa-market (6 Free-plan data calls)",
  ),
);

export const verify = Command.make("verify", { scope, json, qa }, (o) =>
  Effect.promise(() => runVerify(o.scope, { qa: o.qa._tag === "Some" ? o.qa.value : undefined }))
    .pipe(
      Effect.tap((evidence) =>
        Effect.sync(() => {
          if (!o.json) process.stderr.write(formatTable(evidence));
          if (!evidence.ok) process.exitCode = 1;
        }),
      ),
      Effect.flatMap(emit),
    )
    .pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Run the verification contract and print Evidence JSON (the only accepted proof of work)",
  ),
);

const bodyFile = Options.text("body-file").pipe(
  Options.withDescription("Path to the pull-request body (markdown)"),
);
const sha = Options.text("sha").pipe(
  Options.withDescription("Commit the PR is at; a prefix of 7+ chars is accepted"),
);

const check = Command.make("check", { bodyFile, sha }, (o) =>
  Effect.sync(() => {
    const result = checkPrBody(readFileSync(o.bodyFile, "utf8"), o.sha);
    if (!result.ok) process.exitCode = 1;
    return result;
  })
    .pipe(Effect.flatMap(emit))
    .pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Assert the `## Evidence` block in a PR body is for this sha, clean, and ok",
  ),
);

export const evidence = Command.make("evidence").pipe(
  Command.withDescription("Validate Evidence pasted into pull requests (what CI runs)"),
  Command.withSubcommands([check]),
);
