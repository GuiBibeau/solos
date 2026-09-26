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
import { fundingSide, setupSides } from "./liquidity-token-accounts.js";
import { WSOL_MINT } from "./wrap-sol.js";

/**
 * @param {{ quote: { requiredA: bigint; requiredB: bigint }; accounts: any }} plan
 * @param {"A" | "B"} label
 */
const sideOf = ({ quote, accounts }, label) =>
  label === "A"
    ? {
        required: quote.requiredA,
        mint: accounts.vault0Mint,
        ata: accounts.tokenAccount0,
        program: accounts.programs.token0,
      }
    : {
        required: quote.requiredB,
        mint: accounts.vault1Mint,
        ata: accounts.tokenAccount1,
        program: accounts.programs.token1,
      };

/**
 * @param {{ read: ReturnType<typeof import("./liquidity-token-accounts.js").liquidityRead>;
 *   kit: import("../signer/kit-signer.js").KitSignerShape;
 *   quote: { requiredA: bigint; requiredB: bigint }; accounts: any; covered?: bigint }} plan
 */
export const openFunding = ({ read, kit, quote, accounts, covered }) =>
  setupSides(
    read,
    { tokenOwnerAccountA: accounts.tokenAccount0, tokenOwnerAccountB: accounts.tokenAccount1 },
    ({ row, label }) => {
      const side = sideOf({ quote, accounts }, label);
      return fundingSide({
        kit,
        row,
        label,
        verb: "open",
        ...side,
        covered: side.mint === WSOL_MINT ? covered : 0n,
      });
    },
  );
