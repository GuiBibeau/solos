// @ts-check

/**
 * Canned Jupiter Swap V2 quote-only bodies and the request pair they answer.
 *
 * Provenance. Endpoint contract: `GET {base}/swap/v2/order` (developers.jup.ag, Swap API V2 —
 * "Order & Execute" and the swap.yaml OpenAPI spec), rechecked 2026-09-18. Live probes on
 * api.jup.ag in 2026-08: a taker-less request returned 200 with `transaction: null`,
 * `taker: null`, `mode: "ultra"`, `router: "metis"`, `priceImpact` a JSON number in percentage
 * points (deprecated `priceImpactPct` string exactly `priceImpact / 100`), and the undocumented
 * extras `guaranteedPrice` and `jitOptimized` (both boolean). All routers excluded returns
 * 400 `{"requestId": "...", "error": "Failed to get quotes"}`. The canned bodies carry only
 * fields the provider documents or was observed to return — never a fabricated zero for a
 * missing field.
 *
 * Response-field/unit mapping exercised by these bodies:
 * - `inAmount`/`outAmount`/`otherAmountThreshold`: exact decimal strings in base units.
 * - `priceImpact`: percentage points JSON number -> `priceImpactPct` = `priceImpact / 100`.
 * - `routeSummary`: `routePlan[].swapInfo.label` hop labels (V2 has no routeSummary object).
 * - `expiresAt`: local receipt time + 30_000 ms local TTL (not a provider guarantee).
 */

export const KEY = "test-jupiter-key";
/** wSOL and USDC: well-known public mints, used as the fixture pair. */
export const INPUT_MINT = "So11111111111111111111111111111111111111112";
export const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** 31 digits: base units must never pass through a JS Number on the way in or out. */
export const AMOUNT = "1000000000000000000000000000000";
export const OUT_AMOUNT = "169900000000000000000000000000";
/***
 * Requested minimum at the 50 bps default tolerance: floor(OUT_AMOUNT * 9950 / 10000), BigInt.
 * The tolerance is a maximum loss, so this floor is the least protective threshold allowed.
 */
export const MIN_OUT_AMOUNT = "169050500000000000000000000000";
/** One percentage point: asserts the legacy divide-by-100 ratio convention ("0.01"). */
export const PRICE_IMPACT = 1;
/** Live-observed Orca ammKey used by the canned route hop. */
export const OK_AMM_KEY = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";

/** Documented success body the fixture serves by default: quote-only, Metis-routed. */
export const okBody = (overrides = {}) => ({
  mode: "manual",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: OUT_AMOUNT,
  otherAmountThreshold: MIN_OUT_AMOUNT,
  priceImpact: PRICE_IMPACT,
  priceImpactPct: String(PRICE_IMPACT / 100),
  swapMode: "ExactIn",
  slippageBps: 50,
  router: "metis",
  swapType: "aggregator",
  routePlan: [
    {
      swapInfo: {
        ammKey: OK_AMM_KEY,
        label: "Orca",
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        inAmount: AMOUNT,
        outAmount: OUT_AMOUNT,
      },
      percent: 100,
      bps: 10_000,
    },
  ],
  transaction: null,
  taker: null,
  guaranteedPrice: false,
  jitOptimized: false,
  ...overrides,
});

/**
 * One documented route step; fields default to a consistent single-hop wSOL -> USDC shape.
 */
export const routeHop = ({
  from = INPUT_MINT,
  to = OUTPUT_MINT,
  amount = AMOUNT,
  out = OUT_AMOUNT,
  bps = 10_000,
}) => ({
  swapInfo: {
    ammKey: OK_AMM_KEY,
    label: "Orca",
    inputMint: from,
    outputMint: to,
    inAmount: amount,
    outAmount: out,
  },
  percent: bps / 100,
  bps,
});

/** Canonical quote request for the fixture pair, at the documented default slippage. */
export const quoteRequest = () => ({
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  slippageBps: 50,
});
