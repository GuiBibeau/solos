// @ts-check
/** @type {import("./replay-builder.js").Boundary[]} */
export const tradingPositions = [
  {
    criterion: 4,
    id: "identity",
    dimension: "identity",
    requirement:
      "Token mint, lend market/mint plus nonzero obligation IDs, perp trader/market and LP protocol/account identities reject duplicates across cash/positions; shared account equity counted once.",
    surfaces: [
      "schema.token-duplicates",
      "schema.cash-position-duplicates",
      "schema.lend-obligations",
      "schema.lend-duplicates",
      "schema.perp-duplicates",
      "schema.lp-duplicates",
      "schema.equity-duplicates",
      "schema.distinct-identities",
      "schema.matching-account",
    ],
  },
  {
    criterion: 4,
    id: "valuation",
    requirement:
      "Short/flat exposure, signed equity, LP underlying principal and u128 Orca/Raydium liquidity, 0..255 decimals, unsupported/nonzero null values and unknown equity propagate null aggregate; known zero principal does not.",
    surfaces: [
      "schema.short",
      "schema.flat-exact-zero",
      "schema.signed-equity",
      "schema.lp-underlying",
      "schema.lp-liquidity:u128,u128+1",
      "schema.decimals:0,255,256",
      "schema.null-cash",
      "schema.null-token",
      "schema.null-lend",
      "schema.null-lp",
      "schema.null-equity",
      "schema.zero-principal",
    ],
  },
];
