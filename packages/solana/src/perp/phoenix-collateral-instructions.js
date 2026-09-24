// @ts-check
import {
  buildDepositIxsResolved,
  buildWithdrawIxsResolved,
  EMBER_PROGRAM_ADDRESS,
  getDepositFundsDecoder,
  getEmberDepositDecoder,
  getEmberWithdrawDecoder,
  getWithdrawFundsDecoder,
  PHOENIX_PROGRAM_ADDRESS,
  SPL_ATA_PROGRAM_ADDRESS,
  SPL_TOKEN_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { address } from "@solana/kit";
import { BuildRejected } from "@solos/core";

const PROGRAMS = {
  deposit: [SPL_ATA_PROGRAM_ADDRESS, EMBER_PROGRAM_ADDRESS, PHOENIX_PROGRAM_ADDRESS],
  withdraw: [
    SPL_ATA_PROGRAM_ADDRESS,
    SPL_TOKEN_PROGRAM_ADDRESS,
    SPL_ATA_PROGRAM_ADDRESS,
    PHOENIX_PROGRAM_ADDRESS,
    EMBER_PROGRAM_ADDRESS,
  ],
};

/** @param {"deposit" | "withdraw"} direction @param {readonly import("@ellipsis-labs/rise").InstructionsWithAccountsAndData[]} ixs */
const assertPrograms = (direction, ixs) => {
  const programs = PROGRAMS[direction];
  if (ixs.length !== programs.length || ixs.some((ix, i) => ix.programAddress !== programs[i]))
    throw new BuildRejected({
      reason: "Phoenix collateral instructions contain an unexpected program",
    });
};

/** @param {"deposit" | "withdraw"} direction @param {readonly import("@ellipsis-labs/rise").InstructionsWithAccountsAndData[]} ixs @param {bigint} input */
const verifyOfficial = (direction, ixs, input) => {
  assertPrograms(direction, ixs);
  try {
    /** @type {Array<[number, {decode:(bytes:Uint8Array)=>bigint | null}]>} */
    const codecs =
      direction === "deposit"
        ? [
            [2, getDepositFundsDecoder()],
            [1, getEmberDepositDecoder()],
          ]
        : [
            [3, getWithdrawFundsDecoder()],
            [4, getEmberWithdrawDecoder()],
          ];
    for (const [index, decoder] of codecs) {
      if (decoder.decode(Uint8Array.from(ixs[index]?.data ?? [])) !== input)
        throw new Error("amount");
    }
  } catch {
    throw new BuildRejected({
      reason: "Phoenix collateral instructions do not encode the exact input amount",
    });
  }
};

/**
 * The pinned Rise SDK constructs local (not provider-supplied) canonical instructions. Reject
 * unexpected programs/signers and independently decode BOTH venue input fields before signing.
 * @param {"deposit" | "withdraw"} direction
 * @param {import("@ellipsis-labs/rise").BuildWithdrawIxsResolvedInput} parts
 */
export const collateralInstructions = (direction, parts) => {
  const built =
    direction === "deposit" ? buildDepositIxsResolved(parts) : buildWithdrawIxsResolved(parts);
  const ixs = built.instructions;
  verifyOfficial(direction, ixs, parts.amount);
  if (
    ixs.some((ix) =>
      ix.accounts?.some((meta) => meta.role >= 2 && meta.address !== parts.trader.authority),
    )
  )
    throw new BuildRejected({ reason: "Phoenix collateral instruction requires a foreign signer" });
  return ixs.map((ix) => ({
    programAddress: address(ix.programAddress),
    accounts: ix.accounts.map((meta) => ({ address: address(meta.address), role: meta.role })),
    data: Uint8Array.from(ix.data),
  }));
};
