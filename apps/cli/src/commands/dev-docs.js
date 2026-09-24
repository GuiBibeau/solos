// @ts-check
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { checkDocs } from "../docs/check.js";
import { emit, exitOnFailure } from "../output.js";

const write = Options.boolean("write").pipe(
  Options.withDescription("Rewrite the generated regions in place instead of reporting drift"),
);

const check = Command.make("check", { write }, (o) =>
  Effect.sync(() => {
    const report = checkDocs({ write: o.write });
    if (!report.ok) process.exitCode = 1;
    return report;
  })
    .pipe(Effect.flatMap(emit))
    .pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Assert the generated regions in README.md and AGENTS.md match the tool registry",
  ),
);

export const docs = Command.make("docs").pipe(
  Command.withDescription("Keep hand-written documentation honest against the tool registry"),
  Command.withSubcommands([check]),
);
