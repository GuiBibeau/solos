// @ts-check
import { Command, Options } from "@effect/cli";
import {
  eventSummaryTool,
  getEventSummary,
  getTokenNews,
  getTrendingTokens,
  tokenNewsTool,
  trendingTokensTool,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, optionHelp } from "./tool-help.js";

const timeWindow = Options.choice("time-window", ["30m", "1h", "4h", "24h", "7d", "30d"]).pipe(
  Options.withDefault("24h"),
  optionHelp(trendingTokensTool.input.shape.timeWindow),
);
const page = Options.integer("page").pipe(
  Options.withDefault(1),
  optionHelp(trendingTokensTool.input.shape.page),
);
const pageSize = Options.integer("page-size").pipe(
  Options.withDefault(10),
  optionHelp(trendingTokensTool.input.shape.pageSize),
);
const minMentions = Options.integer("min-mentions").pipe(
  Options.withDefault(5),
  optionHelp(trendingTokensTool.input.shape.minMentions),
);
const coinIds = Options.text("coin-ids").pipe(optionHelp(tokenNewsTool.input.shape.coinIds));
const keywords = Options.text("keywords").pipe(optionHelp(eventSummaryTool.input.shape.keywords));
const searchType = Options.choice("search-type", ["and", "or"]).pipe(
  Options.withDefault("or"),
  optionHelp(eventSummaryTool.input.shape.searchType),
);

export const trending = Command.make("trending", { timeWindow, page, pageSize, minMentions }, (o) =>
  withSolos(getTrendingTokens(o).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(trendingTokensTool));

export const news = Command.make("news", { coinIds, timeWindow, page, pageSize }, (o) =>
  withSolos(getTokenNews({ ...o, coinIds: o.coinIds.split(",") }).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(commandHelp(tokenNewsTool));

export const summary = Command.make("summary", { keywords, timeWindow, searchType }, (o) =>
  withSolos(
    getEventSummary({ ...o, keywords: o.keywords.split(",") }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(eventSummaryTool));
