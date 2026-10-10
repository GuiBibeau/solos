// @ts-check
/**
 * Help for a command that wraps a tool. `--help` shows the tool's short title; the MCP
 * description stays on the tool. Option help is that argument's Zod `.describe()` text.
 */
import { Command, Options } from "@effect/cli";

/** @param {{ readonly title: string }} tool */
export const commandHelp = (tool) => Command.withDescription(tool.title);

/**
 * A flag that chooses a tool rather than filling one of its arguments. The text is that
 * tool's title, the same short line a command shows.
 * @param {{ readonly title: string }} tool
 */
export const modeHelp = (tool) => Options.withDescription(tool.title);

/**
 * Option help taken from a tool argument. Empty means the argument was not `.describe()`d.
 * @param {import("zod").ZodType} field
 */
export const optionHelp = (field) => {
  const text = field.description ?? "";
  if (text.length === 0) throw new Error("tool argument has no description");
  return Options.withDescription(text);
};

/**
 * Blurb for a command group. A group is not a tool, so this is the one hand-written line
 * a tool-backed file may keep.
 * @param {string} text
 */
export const groupHelp = (text) => Command.withDescription(text);
