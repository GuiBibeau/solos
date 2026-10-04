// @ts-check
import { homedir } from "node:os";
import { Args, Command, Options } from "@effect/cli";
import { diagnoseSolanaEnv } from "@solos/solana";
import { Effect, Option } from "effect";
import { CLIENT_NAMES, CLIENTS } from "../connect/clients.js";
import { serverEntry } from "../connect/entry.js";
import { ConnectScopeUnsupported } from "../connect/errors.js";
import { readIfExists, writeWithBackup } from "../connect/write.js";
import { emit, exitOnFailure } from "../output.js";

const client = Args.choice(
  CLIENT_NAMES.map((name) => /** @type {[string, typeof name]} */ ([name, name])),
  { name: "client" },
).pipe(Args.withDescription("claude | codex | cursor"));
const scope = Options.choice("scope", ["user", "project"]).pipe(
  Options.withDefault("user"),
  Options.withDescription(
    "user writes the client's home config; project writes the config in the current directory (Claude Code and Cursor)",
  ),
);
const tier = Options.choice("tier", ["read", "simulate", "execute"]).pipe(
  Options.optional,
  Options.withDescription(
    "Tier ceiling written into the entry; without it the server offers read and simulate tools (ADR-0033)",
  ),
);
const tools = Options.choice("tools", ["discover", "all"]).pipe(
  Options.optional,
  Options.withDescription(
    "Tool discovery written into the entry; all is for clients that ignore tools/list_changed",
  ),
);
const profile = Options.text("profile").pipe(
  Options.optional,
  Options.withDescription(
    "Profile name for SOLOS_PROFILE in the entry; omitted, the server uses the default profile",
  ),
);
const print = Options.boolean("print").pipe(
  Options.withDescription("Print the entry and the target file; write nothing"),
);

/**
 * @param {(typeof CLIENTS)[keyof typeof CLIENTS]} adapter
 * @param {import("../connect/clients.js").Scope} requested
 */
const checkScope = (adapter, requested) =>
  adapter.scopes.includes(requested)
    ? Effect.void
    : Effect.fail(
        new ConnectScopeUnsupported({
          client: adapter.name,
          scope: requested,
          reason: `${adapter.label} keeps no ${requested}-scoped MCP config`,
          remedy: `run \`solos connect ${adapter.name} --scope ${adapter.scopes[0]}\``,
        }),
      );

/**
 * `solos connect <client>`: put the solos MCP entry into an agent client's config, keeping a
 * timestamped backup of the file, and finish with the doctor's verdict on the environment the
 * server will start in. The entry names this installation's own server command, so a checkout
 * writes `bun --no-env-file <stdio.js>` and the installed binary writes `solos mcp serve`.
 */
export const connect = Command.make(
  "connect",
  { client, scope, tier, tools, profile, print },
  (o) =>
    Effect.gen(function* () {
      const adapter = CLIENTS[o.client];
      yield* checkScope(adapter, o.scope);
      const entry = serverEntry({
        tier: Option.getOrUndefined(o.tier),
        tools: Option.getOrUndefined(o.tools),
        profile: Option.getOrUndefined(o.profile),
      });
      const file = adapter.file(o.scope, { home: homedir(), cwd: process.cwd() });
      const base = { client: adapter.name, scope: o.scope, file, entry };
      if (o.print) {
        return yield* emit({ ...base, written: false, snippet: adapter.render(entry) });
      }
      const { backup } = writeWithBackup(file, adapter.merge(readIfExists(file), entry));
      // The verdict is on the environment the written entry will start the server in, so a
      // --profile overlays whatever profile this shell inherited.
      const doctor = diagnoseSolanaEnv({ ...process.env, ...entry.env });
      yield* emit({
        ...base,
        written: true,
        backup,
        next: adapter.next,
        doctor: { ok: doctor.ok, issues: doctor.issues },
      });
    }).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Write the solos MCP entry into an agent client's config: claude, codex or cursor",
  ),
);
