// @ts-check
import { Command } from "@effect/cli";
import { solosServerCommand } from "@solos/mcp";
import { diagnoseSolanaEnv } from "@solos/solana";
import { Effect } from "effect";
import { emit } from "../output.js";

/**
 * The client config a Caller can paste, built from the real server command. `--no-env-file` is
 * deliberate: the child must not reload an ambient `.env`, which the repo's own MCP client
 * already passes and its isolation test asserts.
 * @param {string | null} profile
 */
const mcpConfig = (profile) => {
  const { command, args } = solosServerCommand();
  return {
    mcpServers: {
      solos: {
        command,
        args,
        env: profile === null ? {} : { SOLOS_PROFILE: profile },
      },
    },
  };
};

export const doctor = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    const report = diagnoseSolanaEnv(process.env);
    yield* emit({ ...report, mcpConfig: mcpConfig(report.profile) });
    if (!report.ok) process.exitCode = 1;
  }),
).pipe(
  Command.withDescription(
    "Validate signer, RPC URL and profile resolution in one pass, without starting a server",
  ),
);
