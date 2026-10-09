// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { SearchToolsInputSchema } from "../domain/types.js";
import { searchTools } from "../use-cases/search-tools.js";

/**
 * The description names no token, venue, group or example request: the local matcher reads
 * descriptions, and an example such as a swap would rank this tool for every swap request.
 */
export const searchToolsTool = defineTool({
  name: "solana_discovery_search_tools",
  group: "discovery",
  tier: "read",
  stability: "beta",
  title: "Find the tools for a request",
  description:
    "Find which solOS tools serve a request, and make them callable. Most tools are withheld " +
    "until asked for, so call this first: give a query in your own words, one group name, or " +
    "exact tool names. On the MCP server the matching tools then join the tool list with their " +
    "full schema. The result names every match, marks the ones this server's tier ceiling " +
    "withholds and says how to raise it, counts matches beyond the listed cap, and when " +
    "nothing matches says what solOS does not cover. Costs no funds and reads nothing on chain.",
  input: SearchToolsInputSchema,
  run: (input) => searchTools(input),
});
