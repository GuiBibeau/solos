// @ts-check
/**
 * The orchestrator's full system prompt, resolved once at build time. `FACTORY_REPO` is injected
 * when the app is compiled, so the orchestrator always knows which repository the line works on.
 * The station pipeline lives here; each station's own procedure lives in its `instructions.md`.
 */
import { defineInstructions } from "eve/instructions";
import { DELIVERY } from "./lib/prompt/delivery.js";
import { IDENTITY } from "./lib/prompt/identity.js";
import { PIPELINE } from "./lib/prompt/pipeline.js";

export default defineInstructions({ markdown: [IDENTITY, PIPELINE, DELIVERY].join("\n\n") });
