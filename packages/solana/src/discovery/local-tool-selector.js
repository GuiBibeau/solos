// @ts-check
import { ToolSelector, localMatches } from "@solos/core";
import { Effect, Layer } from "effect";

/** The deterministic matcher as a ToolSelector: no network, no key, never fails. */
export const LocalToolSelectorLive = Layer.succeed(ToolSelector, {
  name: "local",
  select: ({ query, tools }) => Effect.succeed(localMatches(query, tools)),
});
