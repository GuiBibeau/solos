// @ts-check

/** Shared fixtures for the pure portfolio assembly tests. */

export const WSOL = "So11111111111111111111111111111111111111112";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** @param {Uint8Array} bytes */
const encodeBase58 = (bytes) => {
  /** @type {number[]} */
  const digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += (digits[i] ?? 0) * 256;
      digits[i] = carry % 58;
      carry = Math.trunc(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.trunc(carry / 58);
    }
  }
  return digits
    .toReversed()
    .map((digit) => ALPHABET[digit])
    .join("");
};
/** A fresh valid pubkey string; the leading byte is forced nonzero to keep 32 bytes. */
export const freshAddress = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  bytes[0] = (bytes[0] ?? 0) | 0x01;
  return encodeBase58(bytes);
};

export const DOG = freshAddress();
export const OWNER = freshAddress();
export const MARKET = freshAddress();
export const OBLIGATION = freshAddress();
export const TRADER = freshAddress();
export const POSITION = freshAddress();
/** @param {string} a @param {string} b */
export const compareString = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
const PRICE = { source: "jupiter", at: 1 };

/** @param {readonly string[]} list */
export const isSorted = (list) =>
  JSON.stringify(list) === JSON.stringify([...list].toSorted((a, b) => a.localeCompare(b)));

/** @param {{ mint: string; account: string; amount: string; decimals?: number }} args */
export const balance = ({ mint, account, amount, decimals = 6 }) => ({
  mint,
  tokenAccount: account,
  program: "token",
  amount,
  decimals,
  uiAmount: "0",
});

/** @param {Array<[string, string]>} entries @returns {Map<string, { mint: string; priceUsd: string; source: string; at: number }>} */
export const prices = (...entries) =>
  new Map(entries.map(([mint, priceUsd]) => [mint, { mint, priceUsd, ...PRICE }]));

export const venues = (over = {}) => ({
  lend: { positions: [], perpAccounts: [], receiptMints: [] },
  perp: { positions: [], perpAccounts: [], receiptMints: [] },
  liquidity: { positions: [], perpAccounts: [], receiptMints: [] },
  ...over,
});

export const lendPosition = {
  kind: /** @type {"lend"} */ ("lend"),
  protocol: /** @type {"kamino"} */ ("kamino"),
  market: MARKET,
  instrument: USDC,
  amount: "1000000",
  decimals: 6,
  valueUsd: null,
  positions: [OBLIGATION],
};

export const perpPosition = {
  kind: /** @type {"perp"} */ ("perp"),
  protocol: /** @type {"phoenix"} */ ("phoenix"),
  account: TRADER,
  instrument: "SOL",
  side: /** @type {"long"} */ ("long"),
  amount: "100",
  decimals: 9,
  valueUsd: null,
};

export const perpAccount = { protocol: "phoenix", account: TRADER, equityUsd: "12.5" };

export const lpPosition = {
  kind: /** @type {"lp"} */ ("lp"),
  protocol: /** @type {"orca"} */ ("orca"),
  position: POSITION,
  instrument: MARKET,
  liquidity: "1000",
  tokenA: { mint: USDC, amount: "500000", decimals: 6 },
  tokenB: { mint: DOG, amount: "1000000", decimals: 6 },
  valueUsd: null,
};

/** Same identity rule the published schema refines on.
 * @param {import("@solos/actions").Position} entry */
export const identityOf = (entry) => {
  if (entry.kind === "token") return JSON.stringify([entry.kind, entry.instrument]);
  if (entry.kind === "lend") {
    return JSON.stringify([entry.kind, entry.protocol, entry.market, entry.instrument]);
  }
  if (entry.kind === "perp") {
    return JSON.stringify([entry.kind, entry.protocol, entry.account, entry.instrument]);
  }
  return JSON.stringify([entry.kind, entry.protocol, entry.position]);
};
