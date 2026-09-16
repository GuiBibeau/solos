// @ts-check
/**
 * Disables the built-in `agent` tool on the root orchestrator: it would run an undifferentiated
 * clone of the root and let it bypass the four stations. All delegation goes through the declared
 * subagents.
 */
import { disableTool } from "eve/tools";

export default disableTool();
