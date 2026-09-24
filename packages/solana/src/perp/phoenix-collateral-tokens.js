// @ts-check
import {
  decodeMint,
  decodeTokenAccount,
  getPhoenixTraderTokenAccountAddress,
  SPL_TOKEN_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { getCollateralAccount, readCollateralAccount } from "./phoenix-collateral-accounts.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @param {string} key */
const riseKey = (key) =>
  /** @type {import("@ellipsis-labs/rise").Authority} */ (/** @type {unknown} */ (key));
/** @param {string} key */
const riseMint = (key) =>
  /** @type {import("@ellipsis-labs/rise").MintAddress} */ (/** @type {unknown} */ (key));

/** The only permitted wallet destinations/sources are canonical associated token accounts.
 * @param {string} owner @param {string} usdcMint @param {string} canonicalMint */
export const collateralAtas = async (owner, usdcMint, canonicalMint) => {
  const [usdc, phoenix] = await Promise.all([
    getPhoenixTraderTokenAccountAddress(riseKey(owner), riseMint(usdcMint)),
    getPhoenixTraderTokenAccountAddress(riseKey(owner), riseMint(canonicalMint)),
  ]);
  return { usdc, phoenix };
};

/** @param {Rpc} ctx @param {string} mint */
export const requireCollateralMint = (ctx, mint) =>
  Effect.gen(function* () {
    const row = yield* readCollateralAccount(ctx, mint, "collateral mint");
    if (row.owner !== SPL_TOKEN_PROGRAM_ADDRESS)
      return yield* new BuildRejected({
        reason: "Phoenix collateral mint is not a classic token mint",
      });
    const state = yield* Effect.try({
      try: () => decodeMint(row.bytes),
      catch: () => new BuildRejected({ reason: "Phoenix collateral mint could not be decoded" }),
    });
    if (!state.isInitialized || state.decimals !== 6)
      return yield* new BuildRejected({
        reason: "Phoenix collateral mint decimals or state are unsupported",
      });
  });

/** @param {{ owner: string; mint: string }} input @param {import("@ellipsis-labs/rise").TokenAccount} state */
const assertTokenCustody = (input, state) => {
  if (
    state.owner !== input.owner ||
    state.mint !== input.mint ||
    state.state !== 1 ||
    state.delegateOption !== 0 ||
    state.closeAuthorityOption !== 0
  )
    throw new BuildRejected({ reason: "Phoenix wallet token account has unsafe custody" });
};

/** @param {Rpc} ctx @param {{ key: string; owner: string; mint: string; required: boolean }} input */
export const readCollateralTokenBalance = (ctx, input) =>
  Effect.gen(function* () {
    const row = yield* getCollateralAccount(ctx, input.key);
    if (row === null) {
      if (input.required)
        return yield* new BuildRejected({ reason: "Phoenix wallet USDC account is missing" });
      return 0n;
    }
    if (row.owner !== SPL_TOKEN_PROGRAM_ADDRESS || row.bytes.length !== 165)
      return yield* new BuildRejected({
        reason: "Phoenix wallet token account has wrong owner or layout",
      });
    const state = yield* Effect.try({
      try: () => decodeTokenAccount(row.bytes),
      catch: () =>
        new BuildRejected({ reason: "Phoenix wallet token account could not be decoded" }),
    });
    return yield* Effect.try({
      try: () => {
        assertTokenCustody(input, state);
        return state.amount;
      },
      catch: () => new BuildRejected({ reason: "Phoenix wallet token account has unsafe custody" }),
    });
  });
