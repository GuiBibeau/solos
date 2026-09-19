// @ts-check
import { replayContract } from "./replay-builder.js";
import { tradingCriteria } from "./trading-criteria.js";
import { tradingPositions } from "./trading-positions.js";

/** @type {{number: number, criteria: string[], boundaries: import("./replay-builder.js").Boundary[]}} */
const contract = {
  number: 35,
  criteria: tradingCriteria,
  boundaries: [
    {
      criterion: 1,
      id: "published",
      validator: "review",
      requirement: "ADRs 0018–0022, glossary and Action/Position docs agree.",
      surfaces: ["docs.contracts"],
    },
    {
      criterion: 2,
      id: "pump",
      requirement:
        "Explicit Pump wSOL route uses positive u64 amounts and 0..9999 integer slippage; legacy Jupiter omitted/explicit serialization remains compatible.",
      surfaces: [
        "schema.route",
        "schema.wsol-identity",
        "schema.amount:0,1,u64,u64+1",
        "schema.slippage:-1,0,9999,10000,fraction",
        "compat.jupiter",
      ],
    },
    {
      criterion: 3,
      id: "lp",
      dimension: "identity",
      requirement:
        "Existing position account required, A/B u64 max spends with at least one positive, remove fraction 1..10000 and slippage 0..9999.",
      surfaces: [
        "schema.position-not-nft",
        "schema.amountA:0,1,u64,u64+1",
        "schema.amountB:0,1,u64,u64+1",
        "schema.both-zero",
        "schema.bps:0,1,10000,10001,fraction",
        "schema.slippage",
      ],
    },
    ...tradingPositions,
    {
      criterion: 5,
      id: "perp",
      requirement:
        "Perps require positive exact decimal price, positive u64 1e6 notional, leverage 1..100 and both trader indices exactly zero.",
      surfaces: [
        "schema.price:zero,negative,exponent,number,positive",
        "schema.notional:0,1,u64,u64+1,unsafe-number",
        "schema.leverage:below-1,1,100,above-100",
        "schema.trader-index",
        "schema.subaccount-index",
      ],
    },
    {
      criterion: 5,
      id: "state-validation",
      validator: "review",
      requirement:
        "ADR assigns owner/account/market validation, <=5s state, <=32slot expiry, buy-down/sell-up ticks, floor lot/quote caps, dust/overflow rejection, flat opens and reduce-only closes to adapters; schemas alone do not prove runtime enforcement.",
      surfaces: [
        "contract.fresh-state",
        "contract.rounding",
        "contract.reduce-only",
        "contract.owner",
        "contract.partial-fill",
      ],
    },
    {
      criterion: 6,
      id: "lending",
      requirement:
        "Lend/withdraw require explicit configured market and positive u64 underlying amount; no hidden best-yield selector.",
      surfaces: [
        "schema.lend-market",
        "schema.withdraw-market",
        "schema.lend-amount",
        "schema.withdraw-amount",
      ],
    },
    {
      criterion: 6,
      id: "enumeration",
      validator: "review",
      requirement:
        "Contracts distinguish absent Layer, incomplete provider enumeration, absent LP vs zero liquidity and complete Pump vs migration.",
      surfaces: ["contract.coverage", "contract.lp-read", "contract.pump-read"],
    },
    {
      criterion: 7,
      id: "package",
      validator: "review",
      responsibility: "standards",
      requirement: "Changeset, exact examples and package independence preserved.",
      surfaces: ["package.version", "package.examples", "package.imports"],
    },
    {
      criterion: 8,
      id: "handoff",
      validator: "review",
      requirement:
        "Issue briefs agree; Meteora unenforceable minimum receipts park only #32 execution for a precise atomic-enforcement decision.",
      surfaces: ["contract.downstream", "contract.meteora-gap"],
    },
    {
      criterion: 9,
      id: "compatibility",
      dimension: "compatibility",
      requirement:
        "Legacy transfer/wallet/Elfa/Jupiter unchanged; new invalid venue requests report validation errors.",
      surfaces: ["schema.compatibility", "schema.domain-errors"],
    },
    {
      criterion: 10,
      id: "evidence",
      validator: "review",
      requirement: "Clean exact-head Evidence/full CI and factory protected-path rules preserved.",
      surfaces: ["evidence", "ci.full", "factory.protection"],
    },
    {
      criterion: 11,
      id: "links",
      validator: "review",
      requirement: "PR links prerequisite/downstream issues with merge-before-dispatch ordering.",
      surfaces: ["handoff.links"],
    },
  ],
};

export const tradingReplay = () => replayContract(contract);
