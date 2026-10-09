// @ts-check
import { Command } from "@effect/cli";
import { diagnoseSolanaEnv } from "@solos/solana";
import { Effect } from "effect";
import { mcpServersConfig, serverEntry } from "../connect/entry.js";
import { emit } from "../output.js";
import { releaseIdentity } from "../release/identity.js";

/**
 * The client config a Caller can paste, built from this installation's real server command
 * (`solos connect` writes the same entry). A checkout's command carries `--no-env-file` on
 * purpose: the child must not reload an ambient `.env`, which the repo's own MCP client already
 * passes and its isolation test asserts.
 * @param {string | null} profile
 */
const mcpConfig = (profile) => mcpServersConfig(serverEntry({ profile: profile ?? undefined }));

export const doctor = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    const report = diagnoseSolanaEnv(process.env);
    yield* emit({ ...report, release: releaseIdentity(), mcpConfig: mcpConfig(report.profile) });
    if (!report.ok) process.exitCode = 1;
  }),
).pipe(
  Command.withDescription(
    "Validate signer, RPC URL and profile resolution in one pass, and report the release this solos is, without starting a server",
  ),
);
