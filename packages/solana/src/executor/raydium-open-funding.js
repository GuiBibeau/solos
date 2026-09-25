// @ts-check
/**
 * Proving an open can pay, and creating the side it does not spend from.
 *
 * Raydium takes both token accounts on the instruction whatever the range covers, so a one-sided
 * open still fails with `AccountNotInitialized` when the untouched side's ATA is missing. A side
 * the quote needs nothing from is therefore created idempotently — rent the signer pays and
 * keeps until it closes that account — while a side that is needed but short or absent is a
 * typed refusal, not a simulation error.
 */
import { getTokenDecoder } from "@solana-program/token";
import { Effect } from "effect";
import { createAta, fail, setupSides } from "./liquidity-token-accounts.js";

const tokenDecoder = getTokenDecoder();

/**
 * @param {{ quote: { requiredA: bigint; requiredB: bigint }; accounts: any }} plan
 * @param {"A" | "B"} label
 */
const sideOf = ({ quote, accounts }, label) =>
  label === "A"
    ? { required: quote.requiredA, mint: accounts.vault0Mint, target: accounts.tokenAccount0 }
    : { required: quote.requiredB, mint: accounts.vault1Mint, target: accounts.tokenAccount1 };

/**
 * @param {{ read: ReturnType<typeof import("./liquidity-token-accounts.js").liquidityRead>;
 *   kit: import("../signer/kit-signer.js").KitSignerShape;
 *   quote: { requiredA: bigint; requiredB: bigint }; accounts: any }} plan
 */
export const openFunding = ({ read, kit, quote, accounts }) =>
  setupSides(
    read,
    { tokenOwnerAccountA: accounts.tokenAccount0, tokenOwnerAccountB: accounts.tokenAccount1 },
    ({ row, label }) => {
      const { required, mint, target } = sideOf({ quote, accounts }, label);
      const isAbsent = row === null || row === undefined;
      const held = isAbsent ? null : tokenDecoder.decode(row.bytes).amount;
      if (held !== null && held >= required) return Effect.succeed(null);
      if (required > 0n) {
        const detail = isAbsent
          ? "the funding account does not exist"
          : `${held} available, the open needs ${required}`;
        return fail(`insufficient token ${label} balance: ${detail}`);
      }
      return Effect.succeed(createAta(kit, mint, { ata: target }));
    },
  );
