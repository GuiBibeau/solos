// @ts-check
export const OWNER = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
export const SWAP = {
  type: "swap",
  inputMint: USDC,
  outputMint: OWNER,
  amount: "5000000",
  maxSlippageBps: 50,
};
export const PUMP = {
  ...SWAP,
  venue: "pump",
  inputMint: "So11111111111111111111111111111111111111112",
};
export const OPEN = {
  type: "open_perp",
  market: "SOL-PERP",
  side: "long",
  notionalUsd: "1000000000",
  maxLeverage: 2,
  traderPdaIndex: 0,
  traderSubaccountIndex: 0,
  limitPriceUsd: "150.25",
};
export const CLOSE = {
  type: "close_perp",
  market: "SOL-PERP",
  traderPdaIndex: 0,
  traderSubaccountIndex: 0,
  limitPriceUsd: "148.75",
};
export const LEND = {
  type: "lend",
  protocol: "kamino",
  market: MARKET,
  mint: USDC,
  amount: "1000000",
};
export const ADD = {
  type: "add_liquidity",
  protocol: "orca",
  pool: MARKET,
  position: OWNER,
  amountA: "1000000",
  amountB: "0",
  maxSlippageBps: 50,
  wrapSol: false,
};
export const REMOVE = {
  type: "remove_liquidity",
  protocol: "orca",
  position: OWNER,
  bps: 10_000,
  maxSlippageBps: 50,
};
export const OPEN_POSITION = {
  type: "open_position",
  protocol: "raydium",
  pool: MARKET,
  tickLower: -1000,
  tickUpper: 1000,
  amountA: "1000000",
  amountB: "0",
  maxSlippageBps: 50,
  wrapSol: false,
};
export const CLOSE_POSITION = {
  type: "close_position",
  protocol: "raydium",
  position: OWNER,
};
export const ACTION_SAMPLES = [
  { type: "transfer_sol", to: OWNER, lamports: "100000000" },
  SWAP,
  OPEN,
  CLOSE,
  { type: "onboard_perp", traderPdaIndex: 0, traderSubaccountIndex: 0 },
  {
    type: "deposit_perp_collateral",
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    amount: "1000000",
  },
  {
    type: "withdraw_perp_collateral",
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    amount: "1000000",
  },
  LEND,
  { ...LEND, type: "withdraw_lend" },
  ADD,
  REMOVE,
  OPEN_POSITION,
  CLOSE_POSITION,
  { type: "close_token_account", account: OWNER },
];
