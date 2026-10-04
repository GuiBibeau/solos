// @ts-check
import { describe, expect, test } from "bun:test";
import { SERVE_ARGS, serverCommandFor } from "./index.js";

describe("the command that starts the solos MCP server", () => {
  test("from a checkout it is bun, opted out of ambient .env files, on the stdio entry", () => {
    const command = serverCommandFor({
      executable: "/opt/bun/bin/bun",
      moduleUrl: "file:///repo/packages/mcp/src/client/index.js",
    });
    expect(command.command).toBe("bun");
    expect(command.args[0]).toBe("--no-env-file");
    expect(command.args.at(-1)).toBe("/repo/packages/mcp/src/bin/stdio.js");
  });

  test("from a compiled binary it is that binary serving MCP", () => {
    const command = serverCommandFor({
      executable: "/usr/local/bin/solos",
      moduleUrl: "file:///$bunfs/root/solos",
    });
    expect(command).toEqual({ command: "/usr/local/bin/solos", args: [...SERVE_ARGS] });
  });

  test("Bun's Windows virtual root counts as compiled too", () => {
    const executable = String.raw`C:\solos\solos.exe`;
    const command = serverCommandFor({ executable, moduleUrl: "file:///B:/~BUN/root/solos.exe" });
    expect(command).toEqual({ command: executable, args: ["mcp", "serve"] });
  });
});
