// @ts-check
import { Command, Options } from "@effect/cli";
import { getEventSummary, getTokenNews, getTrendingTokens } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const timeWindow = Options.choice("time-window", ["30m", "1h", "4h", "24h", "7d", "30d"]).pipe(
  Options.withDefault("24h"),
);
const page = Options.integer("page").pipe(Options.withDefault(1));
const pageSize = Options.integer("page-size").pipe(Options.withDefault(10));
const minMentions = Options.integer("min-mentions").pipe(Options.withDefault(5));
const coinIds = Options.text("coin-ids").pipe(
  Options.withDescription("Comma-separated CoinGecko IDs, e.g. solana,bitcoin"),
);
const keywords = Options.text("keywords").pipe(
  Options.withDescription("Comma-separated keywords, e.g. Solana,SOL"),
);
const searchType = Options.choice("search-type", ["and", "or"]).pipe(Options.withDefault("or"));

export const trending = Command.make("trending", { timeWindow, page, pageSize, minMentions }, (o) =>
  withSolos(getTrendingTokens(o).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Find tokens ranked by social mentions; consumes Elfa credits (Free plan supported)",
  ),
);
export const news = Command.make("news", { coinIds, timeWindow, page, pageSize }, (o) =>
  withSolos(getTokenNews({ ...o, coinIds: o.coinIds.split(",") }).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(
  Command.withDescription("Find news-source X posts for CoinGecko coin IDs; consumes Elfa credits"),
);
export const summary = Command.make("summary", { keywords, timeWindow, searchType }, (o) =>
  withSolos(
    getEventSummary({ ...o, keywords: o.keywords.split(",") }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(Command.withDescription("Summarize keyword events with source links; costs 5 Elfa credits"));
