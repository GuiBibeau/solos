// @ts-check
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CliConfig, Command, CommandDescriptor, HelpDoc, Options } from "@effect/cli";
import { getBalanceTool, simulateBuyTool } from "@solos/core";
import { Effect } from "effect";
import { runSolos } from "./cli-fixture.js";
import { commandHelp, modeHelp, optionHelp } from "./tool-help.js";

const DIR = import.meta.dir;

/**
 * Operator commands that do not wrap a tool. Anything else under commands/ is tool-backed,
 * so a new hand-written description fails this file instead of waiting for a reviewer.
 */
const NOT_TOOL_BACKED = new Set([
  "agent.js",
  "connect.js",
  "daemon.js",
  "doctor.js",
  "mcp.js",
  "mcp-serve.js",
  "profiles.js",
  "router.js",
  "tool-help.js",
]);

/** @param {string} name */
const isToolBacked = (name) =>
  name.endsWith(".js") &&
  !name.endsWith(".test.js") &&
  !name.endsWith("-fixture.js") &&
  !name.startsWith("dev") &&
  !name.startsWith("login") &&
  !NOT_TOOL_BACKED.has(name);

/** @param {string} source */
const codeOf = (source) =>
  source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/^\s*\/\/.*$/gm, "");

/** Drop ANSI escapes so an assertion reads the words a person sees. @param {string} text */
const plain = (text) =>
  text
    .split(String.fromCodePoint(27))
    .join("")
    .replaceAll(/\[[0-9;]*m/g, "");

/**
 * A group is `Command.make("name")` with no options. Every other command wraps one tool, so
 * its help has to be `commandHelp(someTool)`.
 * @param {string} file @param {string} code
 */
const assertCommands = (file, code) => {
  let groups = 0;
  for (const block of code.split("Command.make(").slice(1)) {
    const body = block.trimStart();
    const name = body.match(/^"([^"]+)"/)?.[1] ?? file;
    const command = /commandHelp\(\s*(\w+)\s*\)/.exec(body);
    const isGroup = /^"[^"]+"\)/.test(body);
    if (isGroup) {
      groups += 1;
      expect(block.includes("groupHelp("), `${file} ${name}`).toBe(true);
      expect(command, `${file} ${name}`).toBeNull();
    } else {
      expect(command?.[1]?.endsWith("Tool"), `${file} ${name}`).toBe(true);
      expect(block.includes("groupHelp("), `${file} ${name}`).toBe(false);
    }
  }
  expect(groups, file).toBeLessThanOrEqual(1);
};

/** @param {string} file @param {string} code */
const assertOptions = (file, code) => {
  for (const match of code.matchAll(/optionHelp\(\s*([\s\S]*?)\s*\)/g)) {
    const expr = (match[1] ?? "").replaceAll(/\s+/g, "");
    expect(expr, file).toMatch(/^[A-Za-z0-9]+\.input\.shape\.[A-Za-z0-9]+$/);
  }
  const modes = code.matchAll(/modeHelp\(\s*(\w+)\s*\)/g).toArray();
  if (modes.length > 0) {
    expect(file, "modeHelp is only the transfer simulate switch").toBe("transfer.js");
  }
  for (const match of modes) expect(match[1]?.endsWith("Tool"), file).toBe(true);
};

describe("tool-backed command help", () => {
  test("comes from the tool definition, never a hand-written description", () => {
    const files = readdirSync(DIR)
      .filter(isToolBacked)
      .toSorted((left, right) => left.localeCompare(right));
    expect(files).toEqual([
      "discovery.js",
      "launch.js",
      "lend.js",
      "liquidity-lifecycle.js",
      "liquidity-open-options.js",
      "liquidity-withdraw.js",
      "liquidity.js",
      "market-discovery.js",
      "market.js",
      "perp-close-commands.js",
      "perp.js",
      "portfolio.js",
      "swap.js",
      "transfer.js",
      "wallet.js",
    ]);
    const helper = codeOf(readFileSync(path.join(DIR, "tool-help.js"), "utf8"));
    expect(helper).toContain("tool.title");
    expect(helper).not.toContain("tool.description");
    expect(helper).toContain("field.description");
    for (const file of files) {
      const code = codeOf(readFileSync(path.join(DIR, file), "utf8"));
      expect(code, file).not.toMatch(/\.withDescription\s*\(/);
      assertCommands(file, code);
      assertOptions(file, code);
    }
  });

  test("the helper shows the title and the argument text, not the MCP description", () => {
    const described = getBalanceTool.input.shape.owner.description ?? "";
    const command = Command.make(
      "balance",
      {
        owner: Options.text("owner").pipe(
          Options.optional,
          optionHelp(getBalanceTool.input.shape.owner),
        ),
      },
      () => Effect.void,
    ).pipe(commandHelp(getBalanceTool));
    const help = plain(
      HelpDoc.toAnsiText(CommandDescriptor.getHelp(command.descriptor, CliConfig.defaultConfig)),
    );
    expect(help).toContain(getBalanceTool.title);
    expect(help).toContain(described);
    expect(help).not.toContain("all SPL token balances");

    const flagged = Command.make(
      "sol",
      { simulateOnly: Options.boolean("simulate-only").pipe(modeHelp(simulateBuyTool)) },
      () => Effect.void,
    ).pipe(commandHelp(simulateBuyTool));
    const flagHelp = plain(
      HelpDoc.toAnsiText(CommandDescriptor.getHelp(flagged.descriptor, CliConfig.defaultConfig)),
    );
    expect(flagHelp).toContain(simulateBuyTool.title);
    expect(flagHelp).not.toContain("never rerouted to PumpSwap");
  });

  test("--help stays on the short title and the argument text", async () => {
    const wallet = plain((await runSolos(["wallet", "--help"], {})).stdout);
    expect(wallet).toContain("Get wallet balance");
    expect(wallet).toContain("Simulate closing a token account");
    expect(wallet).toContain("Close a token account");
    expect(wallet).not.toContain("all SPL token balances");
    expect(wallet).not.toContain("Preview closing a token account");

    const balance = plain((await runSolos(["wallet", "balance", "--help"], {})).stdout);
    expect(balance).toContain("Get wallet balance");
    expect(balance).toContain(
      "Wallet address to inspect. Omit to use the configured signer's address.",
    );
    expect(balance).not.toContain("all SPL token balances");

    const buy = plain((await runSolos(["launch", "simulate-buy", "--help"], {})).stdout);
    expect(buy).toContain("Simulate a pump.fun buy");
    expect(buy).toContain(
      "Maximum SOL to spend in lamports, including Pump trading fees; never a token amount",
    );
    expect(buy).not.toContain(
      "Maximum SOL to spend in lamports, including Pump trading fees. Never a token amount",
    );
    expect(buy).not.toContain("never rerouted to PumpSwap");
  });
});
