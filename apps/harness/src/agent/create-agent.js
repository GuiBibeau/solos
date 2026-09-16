// @ts-check
import { buildInstructions } from "@solos/mcp";
import { ToolLoopAgent, isStepCount } from "ai";

const PREAMBLE = [
  "You are the solOS harness agent. You act on Solana through the tools below.",
  "Prefer read and simulate tools before execute tools. Report signatures and amounts exactly as returned.",
  "Policy and approval are handled upstream; do not invent limits, but never call an execute tool the user did not ask for.",
].join("\n");

/**
 * @param {{
 *   model: import("ai").LanguageModel;
 *   tools: Record<string, import("ai").Tool>;
 *   groups: Record<string, string>;
 *   definitions: ReadonlyArray<import("@solos/core").AnyToolDefinition>;
 *   maxSteps: number;
 *   activeGroups?: ReadonlyArray<string>;
 *   reasoning?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
 *   providerOptions?: NonNullable<Parameters<typeof import("ai").generateText>[0]["providerOptions"]>;
 * }} options
 */
export const createSolosAgent = ({
  model,
  tools,
  groups,
  definitions,
  maxSteps,
  activeGroups,
  reasoning,
  providerOptions,
}) => {
  const activeTools = activeGroups
    ? Object.keys(tools).filter((name) => activeGroups.includes(groups[name] ?? ""))
    : undefined;
  return new ToolLoopAgent({
    model,
    instructions: `${PREAMBLE}\n\n${buildInstructions(definitions)}`,
    tools,
    stopWhen: isStepCount(maxSteps),
    // Progressive disclosure per step (ADR-0007): only the active groups are visible to the model.
    prepareStep: () => (activeTools ? { activeTools } : {}),
    ...(reasoning && { reasoning }),
    ...(providerOptions && { providerOptions }),
  });
};
